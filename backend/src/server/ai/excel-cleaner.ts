import Groq from "groq-sdk"

import {
  applyFormattingRules,
  cleanRowsWithTemplate,
  getMissingFieldsForTemplate,
  isEssentialField,
  normalizeKey,
  sanitizeCellValue,
} from "../../lib/formatting.js"
import type { AiBatchResult, CleanedRow, ImportSheet, RawImportRow, Template } from "../../lib/types.js"
import {
  EXCEL_CLEANER_PROMPT_VERSION,
  getExcelCleanerSystemPrompt,
} from "./prompts/excel-cleaner.js"
import { cacheKeys, getCache, setCache } from "../redis/cache.js"
import { store } from "../repositories/store.js"
import { getUserAiSettings, getUserDecryptedKey, shouldUseUserApiKey } from "../../routes/settings.js"
import { summarizeCleanedRows } from "../imports/summary.js"
import { logger } from "../../lib/logger.js"

type AiProvider = "groq" | "commandcode" | "cloudflare"

const groqDefaultModel = "openai/gpt-oss-120b"
const commandCodeDefaultModel = "deepseek/deepseek-v4-pro"
const cloudflareDefaultModel = "@cf/google/gemma-4-26b-a4b-it"
const primaryProvider = normalizeAiProvider(process.env.AI_PROCESS_PROVIDER ?? process.env.ROW_AI_PROVIDER ?? "cloudflare")
const configuredPrimaryModel = process.env.AI_PROCESS_MODEL?.trim() || process.env.ROW_AI_MODEL?.trim() || process.env.CLOUDFLARE_AI_MODEL?.trim() || ""
const primaryModel = getPrimaryModelForProvider(primaryProvider, configuredPrimaryModel)
const fallbackModel = process.env.FALLBACK_AI_MODEL?.trim() || "llama-3.3-70b-versatile"
const maxRetries = readNumberEnv("AI_MAX_RETRIES", 2, { min: 0, max: 10 })
const maxCompletionTokens = readNumberEnv("AI_MAX_COMPLETION_TOKENS", 2048, { min: 512, max: 8192 })
const commandCodeBaseUrl = process.env.COMMAND_CODE_BASE_URL?.trim() || "https://api.commandcode.ai/provider/v1"
const commandCodeFallbackModel = process.env.COMMAND_CODE_FALLBACK_AI_MODEL?.trim() || ""
const commandCodeMaxAttempts = readNumberEnv("COMMAND_CODE_AI_MAX_ATTEMPTS", 1, { min: 1, max: 6 })
const commandCodeRequestTimeoutMs = readNumberEnv("COMMAND_CODE_AI_TIMEOUT_MS", 25_000, { min: 5_000, max: 120_000 })
const cloudflareRequestTimeoutMs = readNumberEnv("CLOUDFLARE_AI_TIMEOUT_MS", 60_000, { min: 10_000, max: 120_000 })
const reviewGoodRowsWithAi = process.env.AI_REVIEW_GOOD_ROWS !== "false"

type ProcessingResult = {
  rows: CleanedRow[]
  batches: AiBatchResult[]
  modelUsed: string
  tokenUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

type BatchProgress = {
  batch: AiBatchResult
  batchNo: number
  totalBatches: number
  processedRows: number
  tokenUsage: ProcessingResult["tokenUsage"]
  aiRows: number
  aiUsed: boolean
}

type BatchStart = {
  batchNo: number
  totalBatches: number
  batchRows: number
  aiRows: number
  model: string
}

export async function processImportRows(input: {
  userId: string
  importId: string
  template: Template
  rows: RawImportRow[]
  sheets: ImportSheet[]
  requireBothEmailPhone?: boolean
  generateDescription?: boolean
  correctSpelling?: boolean
  onBatchStart?: (progress: BatchStart) => void | Promise<void>
  onBatchComplete?: (progress: BatchProgress) => void | Promise<void>
}) {
  const batches: AiBatchResult[] = []
  const aiSettings = await getUserAiSettings(input.userId)
  const rowBatches = chunk(input.rows, aiSettings.batchSize)
  const userKey = await shouldUseUserApiKey(input.userId) ? await getUserDecryptedKey(input.userId) : null
  const activeProvider = normalizeAiProvider(userKey?.provider ?? primaryProvider)
  const activeModel = getPrimaryModelForProvider(activeProvider, userKey?.model || primaryModel)
  const aiApiKeys = getAiApiKeys(activeProvider, userKey?.key)
  const aiModels = getAiModels(activeProvider, activeModel)
  const groqClients = activeProvider === "groq" && aiApiKeys.length > 0 ? aiApiKeys.map((k) => new Groq({ apiKey: k })) : []
  const allRows: CleanedRow[] = []
  let modelUsed = aiApiKeys.length > 0 ? `${activeProvider}/${activeModel}` : "demo-local-cleaner"
  const tokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

  logger.info({ importId: input.importId, totalRows: input.rows.length, aiSettings, totalBatches: rowBatches.length, provider: activeProvider, model: activeModel }, "Starting AI processing")

  await store.addHistory(input.userId, input.importId, "ai_processing_started", {
    total_rows: input.rows.length,
    prompt_version: EXCEL_CLEANER_PROMPT_VERSION,
  })

  for (const [batchIndex, rows] of rowBatches.entries()) {
    const batchNo = batchIndex + 1
    const localRows = cleanRowsWithTemplate(rows, input.template, {
      requireBothEmailPhone: input.requireBothEmailPhone,
      correctSpelling: input.correctSpelling,
    })
    const localRowsBeforeSpelling = input.correctSpelling
      ? cleanRowsWithTemplate(rows, input.template, {
          requireBothEmailPhone: input.requireBothEmailPhone,
          correctSpelling: false,
        })
      : localRows
    const localRowsById = new Map(localRows.map((row) => [row.id, row]))
    const localRowsBeforeSpellingById = new Map(localRowsBeforeSpelling.map((row) => [row.id, row]))
    const rowsNeedingAi = rows.filter((row) => shouldSendToAi(localRowsById.get(row.id), input.template, {
      generateDescription: input.generateDescription,
      correctSpelling: input.correctSpelling,
    }))

    logger.info({
      importId: input.importId,
      batchNo,
      batchRows: rows.length,
      aiRows: rowsNeedingAi.length,
      model: rowsNeedingAi.length > 0 ? modelUsed : "deterministic-skip-ai",
    }, "Processing batch")
    await input.onBatchStart?.({
      batchNo,
      totalBatches: rowBatches.length,
      batchRows: rows.length,
      aiRows: rowsNeedingAi.length,
      model: rowsNeedingAi.length > 0 ? modelUsed : "deterministic-skip-ai",
    })

    const detailedReviewEnabled = aiSettings.detailedReviewEnabled || input.correctSpelling === true || input.generateDescription === true
    const aiResult = aiApiKeys.length > 0 && rowsNeedingAi.length > 0
        ? await (activeProvider === "cloudflare"
          ? cleanWithCloudflare({
              credentials: aiApiKeys.map(parseCloudflareCredential).filter((credential): credential is CloudflareCredential => Boolean(credential)),
              models: aiModels,
              rows: rowsNeedingAi,
              template: input.template,
              batchNo,
              aiRequestBatchSize: aiSettings.requestBatchSize,
              requireBothEmailPhone: input.requireBothEmailPhone,
              generateDescription: input.generateDescription,
              correctSpelling: input.correctSpelling,
              detailedReviewEnabled,
            })
          : activeProvider === "commandcode"
          ? cleanWithOpenAiCompatible({
              apiKeys: aiApiKeys,
              baseUrl: commandCodeBaseUrl,
              providerLabel: "Command Code",
              models: aiModels,
              maxAttempts: commandCodeMaxAttempts,
              requestTimeoutMs: commandCodeRequestTimeoutMs,
              rows: rowsNeedingAi,
              template: input.template,
              batchNo,
              aiRequestBatchSize: aiSettings.requestBatchSize,
              requireBothEmailPhone: input.requireBothEmailPhone,
              generateDescription: input.generateDescription,
              correctSpelling: input.correctSpelling,
              detailedReviewEnabled,
            })
          : cleanWithGroq({
              groqClients,
              models: aiModels,
              rows: rowsNeedingAi,
              template: input.template,
              batchNo,
              aiRequestBatchSize: aiSettings.requestBatchSize,
              requireBothEmailPhone: input.requireBothEmailPhone,
              generateDescription: input.generateDescription,
              correctSpelling: input.correctSpelling,
              detailedReviewEnabled,
            })).catch(async (err) => {
          logger.warn({ batchNo, provider: activeProvider, err }, "All AI provider keys exhausted, falling back to deterministic cleaning")
          return {
            rows: cleanRowsWithTemplate(rowsNeedingAi, input.template, {
              requireBothEmailPhone: input.requireBothEmailPhone,
              correctSpelling: input.correctSpelling,
            }),
            usage: null,
            aiUsed: false,
          }
        })
      : null
    const aiRows = aiResult?.rows ?? []
    if (aiResult?.usage && aiResult.usage.total_tokens > 0) {
      tokenUsage.prompt_tokens += aiResult.usage.prompt_tokens
      tokenUsage.completion_tokens += aiResult.usage.completion_tokens
      tokenUsage.total_tokens += aiResult.usage.total_tokens
      logger.info({ batchNo, usage: aiResult.usage, accumulated: { ...tokenUsage } }, "Token usage accumulated")
    }
    const aiRowsById = new Map(aiRows.map((row) => [row.id, row]))
    const cleanedRows = localRows
      .map((row) => aiRowsById.get(row.id) ?? row)
      .map((row) => finalizeCleanedRow(row, localRowsBeforeSpellingById.get(row.id), input.template, {
        generateDescription: input.generateDescription,
        correctSpelling: input.correctSpelling,
        requireBothEmailPhone: input.requireBothEmailPhone,
      }))

    allRows.push(...cleanedRows)

    const batchResult: AiBatchResult = {
      batch_no: batchNo,
      rows: cleanedRows,
      summary: {
        good_count: cleanedRows.filter((row) => row.status === "good").length,
        missing_count: cleanedRows.filter((row) => row.status === "missing").length,
        skipped_count: cleanedRows.filter((row) => row.status === "skipped").length,
        ai_changed_count: cleanedRows.reduce((total, row) => total + row.ai_changes.length, 0),
      },
    }

    logger.info({ batchNo, summary: batchResult.summary }, "Batch completed")
    batches.push(batchResult)
    await setCache(cacheKeys(input.importId).batch(batchNo), batchResult)
    await input.onBatchComplete?.({
      batch: batchResult,
      batchNo,
      totalBatches: rowBatches.length,
      processedRows: allRows.length,
      tokenUsage: { ...tokenUsage },
      aiRows: rowsNeedingAi.length,
      aiUsed: aiResult?.aiUsed ?? false,
    })
  }

  const summary = summarizeCleanedRows(allRows, input.sheets)
  store.setCleanedRows(input.importId, allRows)
  store.updateImport(input.userId, input.importId, {
    ...summary,
    status: "processed",
    model_used: modelUsed,
  })
  await setCache(cacheKeys(input.importId).formatted, allRows)
  await setCache(
    cacheKeys(input.importId).missing,
    allRows.filter((row) => row.status === "missing")
  )
  await setCache(
    cacheKeys(input.importId).skipped,
    allRows.filter((row) => row.status === "skipped")
  )
  await store.addHistory(input.userId, input.importId, "ai_processing_completed", {
    total_rows: allRows.length,
    good_count: summary.good_count,
    missing_count: summary.missing_count,
    skipped_count: summary.skipped_count,
    ai_changed_count: summary.ai_changed_count,
  })

  logger.info({ importId: input.importId, summary, modelUsed, tokenUsage }, "AI processing completed")

  return {
    rows: allRows,
    batches,
    modelUsed,
    tokenUsage,
  } satisfies ProcessingResult
}

type CloudflareCredential = {
  accountId: string
  token: string
}

async function cleanWithCloudflare(input: {
  credentials: CloudflareCredential[]
  models: string[]
  rows: RawImportRow[]
  template: Template
  batchNo: number
  aiRequestBatchSize: number
  requireBothEmailPhone?: boolean
  generateDescription?: boolean
  correctSpelling?: boolean
  detailedReviewEnabled?: boolean
}): Promise<{ rows: CleanedRow[]; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null; aiUsed: boolean }> {
  if (input.rows.length > input.aiRequestBatchSize) {
    const allRows: CleanedRow[] = []
    const totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    let aiUsed = false

    for (const [index, rows] of chunk(input.rows, input.aiRequestBatchSize).entries()) {
      const result = await cleanWithCloudflare({
        ...input,
        rows,
        batchNo: Number(`${input.batchNo}.${index + 1}`),
      })

      allRows.push(...result.rows)
      aiUsed ||= result.aiUsed

      if (result.usage) {
        totalUsage.prompt_tokens += result.usage.prompt_tokens
        totalUsage.completion_tokens += result.usage.completion_tokens
        totalUsage.total_tokens += result.usage.total_tokens
      }
    }

    return {
      rows: allRows,
      usage: totalUsage.total_tokens > 0 ? totalUsage : null,
      aiUsed,
    }
  }

  const localRows = cleanRowsWithTemplate(input.rows, input.template, {
    requireBothEmailPhone: input.requireBothEmailPhone,
    correctSpelling: input.correctSpelling,
  })
  const request = buildAiRequestPayload({ ...input, strictJsonOnly: true })
  const credentials = input.credentials.filter((credential) => credential.accountId && credential.token)

  if (credentials.length === 0) {
    logger.warn({ batchNo: input.batchNo }, "Cloudflare AI account id or token missing, using local fallback")
    return { rows: localRows, usage: null, aiUsed: false }
  }

  const maxAttempts = Math.max(1, credentials.length * input.models.length)

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const credentialIndex = attempt % credentials.length
    const modelIndex = Math.floor(attempt / credentials.length) % input.models.length
    const credential = credentials[credentialIndex]
    const model = input.models[modelIndex]
    const estimatedPromptTokens = estimateTokenCount(`${request.systemPrompt}\n${request.userPayload}`)

    logger.info({
      batchNo: input.batchNo,
      attempt,
      credentialIndex,
      model,
      provider: "Cloudflare Workers AI",
      promptVersion: EXCEL_CLEANER_PROMPT_VERSION,
      estimatedPromptTokens,
      estimatedRows: input.rows.length,
      payloadPreview: truncate(request.userPayload, 6000),
    }, "Calling Cloudflare Workers AI")

    try {
      const result = await requestCloudflareAi({
        credential,
        model,
        systemPrompt: request.systemPrompt,
        userPayload: request.userPayload,
        timeoutMs: cloudflareRequestTimeoutMs,
      })
      const usage = normalizeGroqUsage(result.usage, request.systemPrompt, request.userPayload, result.content)

      logger.info({
        batchNo: input.batchNo,
        attempt,
        credentialIndex,
        model,
        responsePreview: truncate(result.content, 6000),
        usage,
      }, "Cloudflare Workers AI response preview")

      if (!result.content) {
        logger.warn({ batchNo: input.batchNo, attempt, credentialIndex, model }, "Cloudflare Workers AI returned empty content, retrying")
        continue
      }

      const parsed = parseGroqRows(result.content, localRows, input.template, {
        requireBothEmailPhone: input.requireBothEmailPhone,
        generateDescription: input.generateDescription,
        detailedReviewEnabled: request.detailedReviewEnabled,
      })

      if (parsed) {
        logger.info({ batchNo: input.batchNo, attempt, credentialIndex, model, parsedRows: parsed.length }, "Cloudflare Workers AI response parsed successfully")
        return { rows: parsed, usage, aiUsed: true }
      }
      logger.warn({ batchNo: input.batchNo, attempt, credentialIndex, model, contentPreview: result.content.slice(0, 300) }, "Cloudflare Workers AI returned unparseable JSON")
    } catch (err) {
      logger.warn({ batchNo: input.batchNo, attempt, credentialIndex, model, err: err instanceof Error ? { message: err.message, status: (err as any).status } : err }, "Cloudflare Workers AI call failed, retrying")
    }
  }

  logger.warn({ batchNo: input.batchNo }, "All Cloudflare Workers AI attempts exhausted, using local fallback")
  return { rows: localRows, usage: null, aiUsed: false }
}

function shouldSendToAi(
  row: CleanedRow | undefined,
  template: Template,
  options: { generateDescription?: boolean; correctSpelling?: boolean } = {},
) {
  if (!row) {
    return false
  }

  if (
    options.generateDescription &&
    hasDescriptionColumn(template) &&
    row.status !== "skipped" &&
    !hasText(row.cleaned_data[getDescriptionColumnKey(template) ?? ""]) &&
    hasAnyCleanedValue(row)
  ) {
    return true
  }

  if (row.status === "good") {
    return (reviewGoodRowsWithAi || options.correctSpelling === true) && hasAiReviewableText(row, template)
  }

  if (row.status === "missing") {
    return true
  }

  return row.skip_reason === "Could not map any meaningful value to the selected template."
}

function hasAiReviewableText(row: CleanedRow, template: Template) {
  return template.columns_config.some((column) => {
    const target = normalizeKey(`${column.key} ${column.label}`)

    if (
      target.includes("email") ||
      target.includes("mobile") ||
      target.includes("phone") ||
      target.includes("whatsapp") ||
      target.includes("country_code") ||
      target.includes("country code") ||
      target.includes("dial_code") ||
      column.format_rules.includes("uppercase")
    ) {
      return false
    }

    const value = row.cleaned_data[column.key]
    return typeof value === "string" && value.trim().length > 0
  })
}

function hasDescriptionColumn(template: Template) {
  return Boolean(getDescriptionColumnKey(template))
}

function hasAnyCleanedValue(row: CleanedRow) {
  return Object.values(row.cleaned_data).some(hasText)
}

function getDescriptionColumnKey(template: Template) {
  return template.columns_config.find((column) => {
    const target = normalizeKey(`${column.key} ${column.label}`)
    return target.includes("description")
  })?.key
}

export async function getProcessedRows(importId: string, updatedAt?: string) {
  const cached = await getCache<CleanedRow[]>(cacheKeys(importId).formatted, updatedAt)
  if (cached) {
    logger.debug({ importId }, "Returning cached processed rows")
    return cached
  }
  logger.debug({ importId }, "Cache miss for processed rows, falling back to store")
  return store.listCleanedRows(importId)
}

async function cleanWithGroq(input: {
  groqClients: Groq[]
  models: string[]
  rows: RawImportRow[]
  template: Template
  batchNo: number
  aiRequestBatchSize: number
  requireBothEmailPhone?: boolean
  generateDescription?: boolean
  correctSpelling?: boolean
  detailedReviewEnabled?: boolean
}): Promise<{ rows: CleanedRow[]; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null; aiUsed: boolean }> {
  if (input.rows.length > input.aiRequestBatchSize) {
    const allRows: CleanedRow[] = []
    const totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    let aiUsed = false

    for (const [index, rows] of chunk(input.rows, input.aiRequestBatchSize).entries()) {
      const result = await cleanWithGroq({
        ...input,
        rows,
        batchNo: Number(`${input.batchNo}.${index + 1}`),
      })

      allRows.push(...result.rows)
      aiUsed ||= result.aiUsed

      if (result.usage) {
        totalUsage.prompt_tokens += result.usage.prompt_tokens
        totalUsage.completion_tokens += result.usage.completion_tokens
        totalUsage.total_tokens += result.usage.total_tokens
      }
    }

    return {
      rows: allRows,
      usage: totalUsage.total_tokens > 0 ? totalUsage : null,
      aiUsed,
    }
  }

  const localRows = cleanRowsWithTemplate(input.rows, input.template, {
    requireBothEmailPhone: input.requireBothEmailPhone,
    correctSpelling: input.correctSpelling,
  })
  const templateHeaders = input.template.columns_config.map((column) => ({
    key: column.key,
    label: column.label,
    required: column.required,
    format_rules: column.format_rules,
  }))
  const sourceHeaders = unique(
    input.rows.flatMap((row) => Object.keys(row.raw_data ?? {}))
  )
  const sourceHeaderContext = buildSourceHeaderContext(input.rows, sourceHeaders)
  const descriptionKey = getDescriptionColumnKey(input.template)
  const detailedReviewEnabled = input.detailedReviewEnabled ?? true
  const systemPrompt = getExcelCleanerSystemPrompt(detailedReviewEnabled)
  const userPayload = JSON.stringify({
    batch_no: input.batchNo,
    template: templateHeaders,
    source_headers: sourceHeaderContext,
    rules: {
      require_both_email_phone: input.requireBothEmailPhone ?? false,
      correct_spelling: input.correctSpelling ?? false,
      contact_requirement: input.requireBothEmailPhone
        ? "email and phone/mobile are both required"
        : "either email or phone/mobile is enough; only mark contact missing when both are absent",
      description_key: descriptionKey ?? null,
    },
    review_mode: detailedReviewEnabled ? "detailed_ai_changes" : "compact_crm_rows_only",
    rows: input.rows.map((row) => ({
      id: row.id,
      sheet_name: row.sheet_name,
      row_index: row.row_index,
      raw_data: row.raw_data,
    })),
    output_shape: "AiBatchResult.rows only",
    generate_description: input.generateDescription ?? false,
  })

  logger.info({
    batchNo: input.batchNo,
    templateHeaders,
    sourceHeaders: sourceHeaderContext,
    rowCount: input.rows.length,
    sampleRows: input.rows.slice(0, 3).map((row) => ({
      id: row.id,
      sheet: row.sheet_name,
      row: row.row_index,
      raw_data: row.raw_data,
    })),
  }, "AI request headers and row sample")

  const keyCount = input.groqClients.length
  const models = input.models
  const maxAttempts = Math.max(maxRetries + 1, keyCount * models.length)

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const clientIndex = attempt % keyCount
    const modelIndex = Math.floor(attempt / keyCount) % models.length
    const groq = input.groqClients[clientIndex]
    const model = models[modelIndex]
    const estimatedPromptTokens = estimateTokenCount(`${systemPrompt}\n${userPayload}`)
    logger.info({
      batchNo: input.batchNo,
      attempt,
      keyIndex: clientIndex,
      model,
      promptVersion: EXCEL_CLEANER_PROMPT_VERSION,
      estimatedPromptTokens,
      estimatedRows: input.rows.length,
      payloadPreview: truncate(userPayload, 6000),
    }, "Calling Groq API")

    try {
      const response = await groq.chat.completions.create({
        model,
        temperature: 0.1,
        max_completion_tokens: maxCompletionTokens,
        response_format: { type: "json_object" },
        ...getModelOptions(model),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPayload },
        ],
      })
      const content = response.choices[0]?.message?.content
      const finishReason = response.choices[0]?.finish_reason
      const usage = normalizeGroqUsage(response.usage, systemPrompt, userPayload, content ?? "")
      logger.info({
        batchNo: input.batchNo,
        attempt,
        keyIndex: clientIndex,
        model,
        responsePreview: truncate(content ?? "", 6000),
        finishReason,
        usage,
      }, "Groq API response preview")

      if (finishReason === "length") {
        logger.warn({
          batchNo: input.batchNo,
          attempt,
          keyIndex: clientIndex,
          model,
          usage,
        }, "Groq response hit token limit before valid JSON, retrying")
        continue
      }

      if (!content) {
        logger.warn({ batchNo: input.batchNo, attempt, keyIndex: clientIndex }, "Groq returned empty content, retrying")
        continue
      }

      const parsed = parseGroqRows(content, localRows, input.template, {
        requireBothEmailPhone: input.requireBothEmailPhone,
        generateDescription: input.generateDescription,
        detailedReviewEnabled,
      })

      if (parsed) {
        logger.info({
          batchNo: input.batchNo,
          attempt,
          keyIndex: clientIndex,
          model,
          parsedRows: parsed.length,
        }, "Groq response parsed successfully")
        return { rows: parsed, usage, aiUsed: true }
      }
      logger.warn({ batchNo: input.batchNo, attempt, keyIndex: clientIndex, model, contentPreview: (content ?? "").slice(0, 300) }, "Groq returned unparseable JSON")
    } catch (err) {
      logger.warn({ batchNo: input.batchNo, attempt, keyIndex: clientIndex, model, err: err instanceof Error ? { message: err.message, status: (err as any).status } : err }, "Groq API call failed, retrying with next key")
    }
  }

  logger.warn({ batchNo: input.batchNo }, "All Groq keys exhausted, using local fallback")
  return { rows: localRows, usage: null, aiUsed: false }
}

async function cleanWithOpenAiCompatible(input: {
  apiKeys: string[]
  baseUrl: string
  providerLabel: string
  models: string[]
  maxAttempts: number
  requestTimeoutMs: number
  rows: RawImportRow[]
  template: Template
  batchNo: number
  aiRequestBatchSize: number
  requireBothEmailPhone?: boolean
  generateDescription?: boolean
  correctSpelling?: boolean
  detailedReviewEnabled?: boolean
}): Promise<{ rows: CleanedRow[]; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null; aiUsed: boolean }> {
  if (input.rows.length > input.aiRequestBatchSize) {
    const allRows: CleanedRow[] = []
    const totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    let aiUsed = false

    for (const [index, rows] of chunk(input.rows, input.aiRequestBatchSize).entries()) {
      const result = await cleanWithOpenAiCompatible({
        ...input,
        rows,
        batchNo: Number(`${input.batchNo}.${index + 1}`),
      })

      allRows.push(...result.rows)
      aiUsed ||= result.aiUsed

      if (result.usage) {
        totalUsage.prompt_tokens += result.usage.prompt_tokens
        totalUsage.completion_tokens += result.usage.completion_tokens
        totalUsage.total_tokens += result.usage.total_tokens
      }
    }

    return {
      rows: allRows,
      usage: totalUsage.total_tokens > 0 ? totalUsage : null,
      aiUsed,
    }
  }

  const localRows = cleanRowsWithTemplate(input.rows, input.template, {
    requireBothEmailPhone: input.requireBothEmailPhone,
    correctSpelling: input.correctSpelling,
  })
  const request = buildAiRequestPayload({ ...input, strictJsonOnly: true })
  const keyCount = input.apiKeys.length
  const maxAttempts = Math.min(input.maxAttempts, Math.max(1, keyCount * input.models.length))

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const keyIndex = attempt % keyCount
    const modelIndex = Math.floor(attempt / keyCount) % input.models.length
    const apiKey = input.apiKeys[keyIndex]
    const model = input.models[modelIndex]
    const estimatedPromptTokens = estimateTokenCount(`${request.systemPrompt}\n${request.userPayload}`)

    logger.info({
      batchNo: input.batchNo,
      attempt,
      keyIndex,
      model,
      provider: input.providerLabel,
      promptVersion: EXCEL_CLEANER_PROMPT_VERSION,
      estimatedPromptTokens,
      estimatedRows: input.rows.length,
      payloadPreview: truncate(request.userPayload, 6000),
    }, `Calling ${input.providerLabel} API`)

    try {
      const response = await requestOpenAiCompatibleChat({
        apiKey,
        baseUrl: input.baseUrl,
        model,
        systemPrompt: request.systemPrompt,
        userPayload: request.userPayload,
        timeoutMs: input.requestTimeoutMs,
      })
      const content = response.choices?.[0]?.message?.content?.trim() ?? ""
      const finishReason = response.choices?.[0]?.finish_reason
      const usage = normalizeGroqUsage(response.usage, request.systemPrompt, request.userPayload, content)

      logger.info({
        batchNo: input.batchNo,
        attempt,
        keyIndex,
        model,
        provider: input.providerLabel,
        responsePreview: truncate(content, 6000),
        finishReason,
        usage,
      }, `${input.providerLabel} API response preview`)

      if (finishReason === "length") {
        logger.warn({ batchNo: input.batchNo, attempt, keyIndex, model, usage }, `${input.providerLabel} response hit token limit before valid JSON, retrying`)
        continue
      }

      if (!content) {
        logger.warn({ batchNo: input.batchNo, attempt, keyIndex, model }, `${input.providerLabel} returned empty content, retrying`)
        continue
      }

      const parsed = parseGroqRows(content, localRows, input.template, {
        requireBothEmailPhone: input.requireBothEmailPhone,
        generateDescription: input.generateDescription,
        detailedReviewEnabled: request.detailedReviewEnabled,
      })

      if (parsed) {
        logger.info({ batchNo: input.batchNo, attempt, keyIndex, model, parsedRows: parsed.length }, `${input.providerLabel} response parsed successfully`)
        return { rows: parsed, usage, aiUsed: true }
      }
      logger.warn({ batchNo: input.batchNo, attempt, keyIndex, model, contentPreview: content.slice(0, 300) }, `${input.providerLabel} returned unparseable JSON`)
    } catch (err) {
      logger.warn({ batchNo: input.batchNo, attempt, keyIndex, model, err: err instanceof Error ? { message: err.message, status: (err as any).status } : err }, `${input.providerLabel} API call failed, retrying`)
    }
  }

  logger.warn({ batchNo: input.batchNo, provider: input.providerLabel }, `All ${input.providerLabel} keys exhausted, using local fallback`)
  return { rows: localRows, usage: null, aiUsed: false }
}

function buildAiRequestPayload(input: {
  rows: RawImportRow[]
  template: Template
  batchNo: number
  requireBothEmailPhone?: boolean
  generateDescription?: boolean
  correctSpelling?: boolean
  detailedReviewEnabled?: boolean
  strictJsonOnly?: boolean
}) {
  const templateHeaders = input.template.columns_config.map((column) => ({
    key: column.key,
    label: column.label,
    required: column.required,
    format_rules: column.format_rules,
  }))
  const sourceHeaders = unique(
    input.rows.flatMap((row) => Object.keys(row.raw_data ?? {}))
  )
  const sourceHeaderContext = buildSourceHeaderContext(input.rows, sourceHeaders)
  const descriptionKey = getDescriptionColumnKey(input.template)
  const detailedReviewEnabled = input.detailedReviewEnabled ?? true
  const systemPrompt = input.strictJsonOnly
    ? getStrictJsonCleanerSystemPrompt(detailedReviewEnabled)
    : getExcelCleanerSystemPrompt(detailedReviewEnabled)
  const payload = {
    batch_no: input.batchNo,
    template: templateHeaders,
    source_headers: sourceHeaderContext,
    rules: {
      require_both_email_phone: input.requireBothEmailPhone ?? false,
      correct_spelling: input.correctSpelling ?? false,
      contact_requirement: input.requireBothEmailPhone
        ? "email and phone/mobile are both required"
        : "either email or phone/mobile is enough; only mark contact missing when both are absent",
      description_key: descriptionKey ?? null,
    },
    review_mode: detailedReviewEnabled ? "detailed_ai_changes" : "compact_crm_rows_only",
    rows: input.rows.map((row) => ({
      id: row.id,
      sheet_name: row.sheet_name,
      row_index: row.row_index,
      raw_data: row.raw_data,
    })),
    output_shape: "AiBatchResult.rows only",
    generate_description: input.generateDescription ?? false,
  }
  const userPayload = input.strictJsonOnly
    ? `Return only this JSON shape: {"rows":[...]}. Do not explain, list steps, or describe the input.\nInput:\n${JSON.stringify(payload)}`
    : JSON.stringify(payload)

  return {
    templateHeaders,
    sourceHeaderContext,
    detailedReviewEnabled,
    systemPrompt,
    userPayload,
  }
}

function getStrictJsonCleanerSystemPrompt(detailedReviewEnabled = true) {
  return `
You are a CRM import cleaning JSON API.
Return only one valid JSON object. No markdown, no bullets, no commentary, no analysis.
The first character must be "{" and the last character must be "}".
Required response shape:
{"rows":[{"id":"same id","cleaned_data":{},"status":"good|missing|skipped","missing_fields":[],"ai_changes":[]}]}

Rules:
- Output exactly one row for each input row id.
- cleaned_data must contain only the template keys.
- Map source headers by meaning and sample values, including typo headers.
- Extract valid email, country_code, and Indian mobile from mixed contact cells.
- Indian mobile output must be exactly the last 10 digits and start with 6/7/8/9.
- Never invent name, email, phone, city, state, country, or any contact value.
- Split clear city/state/country locations into matching template fields.
- Apply template format_rules: lowercase, uppercase, title_case, date_dd_mm_yyyy, digits_only, last_10_digits, dash_to_blank.
- date_dd_mm_yyyy outputs date only as DD/MM/YYYY; remove time.
- Placeholder values like "-", "--", "---", "#", "##", "###", "N/A", "NA", "test", "sample", and symbol-only cells become "".
- Correct obvious spelling only when rules.correct_spelling=true; never change email or phone spelling.
- If generate_description=true and rules.description_key exists, fill that field with a natural CRM note under 100 chars using only row data.
- Follow rules.contact_requirement exactly for status and missing_fields.
- If rules.require_both_email_phone=true, both email and mobile are required when those template fields exist.
- If rules.require_both_email_phone=false, either valid email or valid mobile is enough; only both missing makes contact missing.
- Missing name alone must not make a row missing when valid email or valid mobile exists.
- skipped means no usable identity/contact value exists.
${detailedReviewEnabled
  ? "- ai_changes must be an array only. Include real semantic, spelling, extraction, and generated-description changes; skip no-op/template-only formatting."
  : "- Set ai_changes to [] for every row. Do not explain changed fields. Save output tokens for CRM cleaned_data only."}
`.trim()
}

type OpenAiCompatibleChatResponse = {
  choices?: Array<{
    finish_reason?: string
    message?: {
      content?: string
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  error?: {
    message?: string
  }
}

type CloudflareAiResponse = {
  error?: { message?: string }
  choices?: Array<{
    message?: {
      content?: string
      reasoning?: string
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

async function requestCloudflareAi(input: {
  credential: CloudflareCredential
  model: string
  systemPrompt: string
  userPayload: string
  timeoutMs: number
}) {
  const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${input.credential.accountId}/ai/v1/chat/completions`)
  const body = {
    model: input.model,
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userPayload },
    ],
    temperature: 0,
    max_tokens: maxCompletionTokens,
  }

  const { response, json } = await postCloudflareAi(url, input.credential.token, body, input.timeoutMs)

  if (!response.ok) {
    const message = json?.error?.message || `Cloudflare Workers AI failed with HTTP ${response.status}`
    const error = new Error(message)
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }

  return {
    content: extractCloudflareContent(json),
    usage: json.usage ?? null,
  }
}

function extractCloudflareContent(payload: CloudflareAiResponse) {
  const content = payload.choices?.[0]?.message?.content?.trim()
  if (content) return content
  return payload.choices?.[0]?.message?.reasoning?.trim() ?? ""
}

async function postCloudflareAi(url: URL, token: string, body: unknown, timeoutMs: number) {
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }, timeoutMs)

  const json = await response.json().catch(() => ({})) as CloudflareAiResponse

  return { response, json }
}

async function requestOpenAiCompatibleChat(input: {
  apiKey: string
  baseUrl: string
  model: string
  systemPrompt: string
  userPayload: string
  timeoutMs: number
}) {
  const url = new URL(`${input.baseUrl.replace(/\/+$/, "")}/chat/completions`)
  const body = {
    model: input.model,
    temperature: 0,
    max_tokens: maxCompletionTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userPayload },
    ],
  }

  let result = await postOpenAiCompatibleChat(url, input.apiKey, body, input.timeoutMs)

  if (result.response.status === 400 && shouldRetryWithoutResponseFormat(result.json)) {
    const fallbackBody = {
      ...body,
      response_format: undefined,
    }
    result = await postOpenAiCompatibleChat(url, input.apiKey, fallbackBody, input.timeoutMs)
  }

  if (!result.response.ok) {
    const error = new Error(result.json.error?.message ?? `OpenAI-compatible API failed with HTTP ${result.response.status}`)
    ;(error as Error & { status?: number }).status = result.response.status
    throw error
  }

  return result.json
}

async function postOpenAiCompatibleChat(url: URL, apiKey: string, body: unknown, timeoutMs: number) {
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }, timeoutMs)

  const json = await response.json().catch(() => ({})) as OpenAiCompatibleChatResponse

  return { response, json }
}

async function fetchWithTimeout(url: URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`AI provider API timed out after ${Math.round(timeoutMs / 1000)}s`)
    }

    throw err
  } finally {
    clearTimeout(timeout)
  }
}

function shouldRetryWithoutResponseFormat(response: OpenAiCompatibleChatResponse) {
  const message = response.error?.message?.toLowerCase() ?? ""

  return message.includes("response_format") ||
    message.includes("json mode") ||
    message.includes("response schema")
}

function normalizeGroqUsage(
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null | undefined,
  systemPrompt: string,
  userPayload: string,
  content: string,
) {
  const promptTokens = Number(usage?.prompt_tokens ?? 0)
  const completionTokens = Number(usage?.completion_tokens ?? 0)
  const totalTokens = Number(usage?.total_tokens ?? 0)

  if (totalTokens > 0 || promptTokens > 0 || completionTokens > 0) {
    return {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens || promptTokens + completionTokens,
    }
  }

  if (!content.trim()) {
    return null
  }

  const estimatedPromptTokens = estimateTokenCount(`${systemPrompt}\n${userPayload}`)
  const estimatedCompletionTokens = estimateTokenCount(content)

  return {
    prompt_tokens: estimatedPromptTokens,
    completion_tokens: estimatedCompletionTokens,
    total_tokens: estimatedPromptTokens + estimatedCompletionTokens,
  }
}

function estimateTokenCount(text: string) {
  return Math.max(1, Math.ceil(text.length / 4))
}

function getModelOptions(model: string) {
  if (!supportsReasoningOptions(model)) {
    return {}
  }

  return {
    reasoning_effort: "low" as const,
    reasoning_format: "hidden" as const,
  }
}

function supportsReasoningOptions(model: string) {
  const normalized = model.toLowerCase()
  return normalized.includes("gpt-oss") || normalized.includes("qwen")
}

function parseGroqRows(
  content: string,
  fallbackRows: CleanedRow[],
  template: Template,
  options: { requireBothEmailPhone?: boolean; generateDescription?: boolean; detailedReviewEnabled?: boolean } = {},
) {
  try {
    const cleaned = content.replace(/```(?:json)?\s*/gi, "").replace(/\s*```/g, "").trim()
    const firstBrace = cleaned.indexOf("{")
    const lastBrace = cleaned.lastIndexOf("}")
    const json = firstBrace >= 0 && lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned
    const parsed = JSON.parse(json) as { rows?: CleanedRow[] }

    if (!Array.isArray(parsed.rows)) {
      logger.warn("Groq response missing rows array")
      return null
    }

    const fallbackById = new Map(fallbackRows.map((row) => [row.id, row]))

    return parsed.rows.map((row, index) => normalizeAiRow(row, fallbackById.get(row.id) ?? fallbackRows[index], template, options))
  } catch {
    logger.warn("Failed to parse Groq JSON response")
    return null
  }
}

function normalizeAiRow(
  row: CleanedRow,
  fallbackRow: CleanedRow | undefined,
  template: Template,
  options: { requireBothEmailPhone?: boolean; generateDescription?: boolean; detailedReviewEnabled?: boolean } = {},
): CleanedRow {
  const base = fallbackRow ?? row
  const inputData = extractAiCleanedData(row, fallbackRow, template)
  const cleanedData = { ...inputData }

  for (const column of template.columns_config) {
    const currentValue = inputData[column.key] ?? ""
    const formatted = applyFormattingRules(sanitizeCellValue(currentValue), column.format_rules)
    const normalized = normalizeColumnValue(column.key, column.label, formatted)
    const fallbackValue = fallbackRow?.cleaned_data[column.key]

    cleanedData[column.key] =
      isContactColumn(column.key, column.label) && !normalized && hasText(fallbackValue)
        ? fallbackValue ?? ""
        : normalized
  }

  const missingFields = getMissingFieldsForTemplate(template, cleanedData, options)
  const aiChanges = options.detailedReviewEnabled === false
    ? []
    : appendGeneratedDescriptionChange(
        normalizeAiChanges(row.ai_changes, cleanedData),
        fallbackRow,
        cleanedData,
        template,
        options.generateDescription,
      )

  return {
    ...base,
    ...row,
    cleaned_data: cleanedData,
    status: row.status === "skipped" ? "skipped" : missingFields.length > 0 ? "missing" : "good",
    missing_fields: row.status === "skipped" ? [] : missingFields,
    ai_changes: aiChanges,
  }
}

function extractAiCleanedData(row: CleanedRow, fallbackRow: CleanedRow | undefined, template: Template) {
  const rowData = (row.cleaned_data && typeof row.cleaned_data === "object" ? row.cleaned_data : {}) as CleanedRow["cleaned_data"]
  const flatRow = row as unknown as Record<string, unknown>
  const hasNestedData = template.columns_config.some((column) => rowData[column.key] !== undefined)
  const hasFlatData = template.columns_config.some((column) => flatRow[column.key] !== undefined)
  const cleanedData: CleanedRow["cleaned_data"] = { ...(fallbackRow?.cleaned_data ?? {}) }

  if (hasNestedData) {
    for (const column of template.columns_config) {
      if (rowData[column.key] !== undefined) {
        cleanedData[column.key] = chooseAiValue(column.key, column.label, rowData[column.key], cleanedData[column.key])
      }
    }

    return cleanedData
  }

  if (hasFlatData) {
    for (const column of template.columns_config) {
      if (flatRow[column.key] !== undefined) {
        cleanedData[column.key] = chooseAiValue(
          column.key,
          column.label,
          flatRow[column.key] as CleanedRow["cleaned_data"][string],
          cleanedData[column.key],
        )
      }
    }

    return cleanedData
  }

  return cleanedData
}

function chooseAiValue(key: string, label: string, aiValue: unknown, fallbackValue: unknown) {
  if (isContactColumn(key, label) && !hasText(aiValue) && hasText(fallbackValue)) {
    return fallbackValue as CleanedRow["cleaned_data"][string]
  }

  return aiValue as CleanedRow["cleaned_data"][string]
}

function isContactColumn(key: string, label: string) {
  const target = normalizeKey(`${key} ${label}`)

  return (
    target.includes("email") ||
    target.includes("mobile") ||
    target.includes("phone") ||
    target.includes("whatsapp") ||
    target.includes("country_code") ||
    target.includes("country code") ||
    target.includes("dial_code")
  )
}

function hasText(value: unknown) {
  return String(value ?? "").trim().length > 0
}

function finalizeCleanedRow(
  row: CleanedRow,
  baselineRow: CleanedRow | undefined,
  template: Template,
  options: { generateDescription?: boolean; correctSpelling?: boolean; requireBothEmailPhone?: boolean } = {},
) {
  if (row.status === "skipped") {
    return row
  }

  const cleanedData = { ...row.cleaned_data }
  let changes = [...row.ai_changes]
  const descriptionKey = getDescriptionColumnKey(template)

  if (options.generateDescription && descriptionKey && !hasText(cleanedData[descriptionKey])) {
    const generatedDescription = generateLocalDescription(cleanedData, template)

    if (generatedDescription) {
      cleanedData[descriptionKey] = generatedDescription
      changes = addChangeOnce(changes, {
        field: descriptionKey,
        before: null,
        after: generatedDescription,
        reason: "Generated description from row data.",
      })
    }
  }

  if (options.correctSpelling && baselineRow) {
    for (const column of template.columns_config) {
      const before = stringifyCell(baselineRow.cleaned_data[column.key])
      const after = stringifyCell(cleanedData[column.key])

      if (before && after && before !== after && !isContactColumn(column.key, column.label)) {
        changes = addChangeOnce(changes, {
          field: column.key,
          before,
          after,
          reason: "Fixed spelling.",
        })
      }
    }
  }

  const missingFields = getMissingFieldsForTemplate(template, cleanedData, {
    requireBothEmailPhone: options.requireBothEmailPhone,
  })

  return {
    ...row,
    cleaned_data: cleanedData,
    status: missingFields.length > 0 ? "missing" as const : "good" as const,
    missing_fields: missingFields,
    ai_changes: changes,
  }
}

function addChangeOnce(changes: CleanedRow["ai_changes"], change: CleanedRow["ai_changes"][number]) {
  if (changes.some((item) => item.field === change.field && item.after === change.after)) {
    return changes
  }

  return [...changes, change]
}

function stringifyCell(value: unknown) {
  return String(value ?? "").trim()
}

function generateLocalDescription(cleanedData: CleanedRow["cleaned_data"], template: Template) {
  const note = getFieldText(cleanedData, template, ["crm_note", "note", "notes", "remark", "comment", "message"])
  const source = getFieldText(cleanedData, template, ["source", "data_source", "lead_source"])
  const possession = getFieldText(cleanedData, template, ["possession", "possesion", "time"])
  const project = getFieldText(cleanedData, template, ["project", "property"])
  const city = getFieldText(cleanedData, template, ["city", "location"])
  const name = getFieldText(cleanedData, template, ["name", "lead_name", "customer"])
  const contact = getFieldText(cleanedData, template, ["email", "mobile", "phone", "whatsapp"])
  const parts: string[] = []

  if (note) {
    parts.push(toSentenceCase(note))
  } else if (name) {
    parts.push(`Lead ${name}`)
  } else if (project) {
    parts.push(`Interested in ${project}`)
  } else if (city) {
    parts.push(`Lead from ${city}`)
  } else if (contact) {
    parts.push("Contact available")
  }

  if (source) {
    parts.push(`from ${source}`)
  }

  if (possession) {
    parts.push(`possession ${possession}`)
  }

  const description = parts.join(", ").replace(/\s+/g, " ").trim()
  return description ? truncate(description, 100) : ""
}

function getFieldText(cleanedData: CleanedRow["cleaned_data"], template: Template, needles: string[]) {
  for (const column of template.columns_config) {
    const target = normalizeKey(`${column.key} ${column.label}`)

    if (needles.some((needle) => target.includes(needle))) {
      const value = stringifyCell(cleanedData[column.key])
      if (value) return value
    }
  }

  return ""
}

function toSentenceCase(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ""
  return trimmed[0].toUpperCase() + trimmed.slice(1)
}

function normalizeColumnValue(key: string, label: string, value: unknown) {
  const text = value === null || value === undefined ? "" : String(value).trim()
  const target = normalizeKey(`${key} ${label}`)

  if (!text) {
    return ""
  }

  if (target.includes("country_code") || target.includes("country code") || target.includes("dial_code")) {
    const normalized = text.replace(/^'+/, "").trim()
    const digits = normalized.replace(/\D/g, "")

    if (normalized.startsWith("+") && digits.length >= 1 && digits.length <= 3) {
      return `+${digits}`
    }

    if (digits.length >= 1 && digits.length <= 3) {
      return `+${digits}`
    }

    return ""
  }

  return text
}

function normalizeAiChanges(changes: unknown, cleanedData: CleanedRow["cleaned_data"]) {
  const list: CleanedRow["ai_changes"] = Array.isArray(changes)
    ? changes
    : typeof changes === "object" && changes !== null
      ? Object.entries(changes).map(([field, value]) => {
          const after = value === null || value === undefined || value === "" ? null : String(value)
          return {
            field,
            before: null,
            after,
            reason: "Changed by AI cleaner.",
          }
        })
      : []
  return list.flatMap((change) => {
    if (isDeterministicFormattingChange(change.reason)) {
      return []
    }

    const after = cleanedData[change.field]
    const normalizedAfter = after === null || after === undefined || after === "" ? null : String(after)
    const before = change.before === null || change.before === undefined || change.before === "" ? null : String(change.before)

    if (before === normalizedAfter) {
      return []
    }

    return [{
      ...change,
      after: normalizedAfter,
      reason: change.after !== normalizedAfter ? "Normalized to the selected template format." : change.reason,
    }]
  })
}

function appendGeneratedDescriptionChange(
  changes: CleanedRow["ai_changes"],
  fallbackRow: CleanedRow | undefined,
  cleanedData: CleanedRow["cleaned_data"],
  template: Template,
  generateDescription = false,
) {
  const descriptionKey = getDescriptionColumnKey(template)

  if (!generateDescription || !descriptionKey) {
    return changes
  }

  const before = fallbackRow?.cleaned_data[descriptionKey]
  const after = cleanedData[descriptionKey]

  if (!hasText(after) || hasText(before) || changes.some((change) => change.field === descriptionKey)) {
    return changes
  }

  return [
    ...changes,
    {
      field: descriptionKey,
      before: null,
      after: String(after),
      reason: "Generated description from row data.",
    },
  ]
}

function isDeterministicFormattingChange(reason: string) {
  return reason.toLowerCase().includes("deterministic template formatting")
}

function normalizeAiProvider(provider: string | null | undefined): AiProvider {
  const normalized = provider?.toLowerCase().replace(/[\s_-]/g, "")
  if (normalized === "cloudflare" || normalized === "workersai") return "cloudflare"
  return normalized === "commandcode" ? "commandcode" : "groq"
}

function getPrimaryModelForProvider(provider: AiProvider, model: string | null | undefined) {
  const selectedModel = model?.trim()

  if (!selectedModel) {
    if (provider === "cloudflare") return cloudflareDefaultModel
    return provider === "commandcode" ? commandCodeDefaultModel : groqDefaultModel
  }

  if (provider === "cloudflare" && !isCloudflareModel(selectedModel)) {
    return cloudflareDefaultModel
  }

  if (provider === "groq" && isCommandCodeModel(selectedModel)) {
    return groqDefaultModel
  }

  if (provider === "commandcode" && (isGroqModel(selectedModel) || isCloudflareModel(selectedModel))) {
    return commandCodeDefaultModel
  }

  return selectedModel
}

function isCommandCodeModel(model: string) {
  return new Set([
    "deepseek/deepseek-v4-pro",
    "minimaxai/minimax-m3",
  ]).has(model.toLowerCase())
}

function isGroqModel(model: string) {
  const normalized = model.toLowerCase()

  return [
    "openai/",
    "meta-llama/",
    "llama-",
    "gemma",
    "moonshotai/",
    "qwen/",
  ].some((prefix) => normalized.startsWith(prefix))
}

function isCloudflareModel(model: string) {
  return model.toLowerCase().startsWith("@cf/")
}

function getAiApiKeys(provider: AiProvider, userKey?: string) {
  const providerKeys = provider === "cloudflare"
    ? [
        process.env.CLOUDFLARE_API,
        process.env.CLOUDFLARE_API_TOKEN,
        process.env.CLOUDFLARE_API_KEY,
      ]
    : provider === "commandcode"
      ? [
          process.env.COMMAND_CODE_API_KEY,
          process.env.COMMANDCODE_API_KEY,
        ]
      : [
          process.env.GROQ_API_KEY,
        ]

  return unique([userKey, ...providerKeys]
    .map((key) => key?.trim())
    .filter(Boolean) as string[])
}

function getAiModels(provider: AiProvider, model: string) {
  if (provider === "cloudflare") {
    return unique([model].filter(Boolean))
  }

  if (provider === "commandcode") {
    return unique([model, commandCodeFallbackModel].filter(Boolean))
  }

  return unique([model, fallbackModel].filter(Boolean))
}

function parseCloudflareCredential(raw: string): CloudflareCredential | null {
  const trimmed = raw.trim()
  const defaultAccountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || process.env.CLOUDFLARE_ACCOUNT?.trim() || process.env.CF_ACCOUNT_ID?.trim() || ""

  if (!trimmed) {
    return null
  }

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { accountId?: string; account_id?: string; token?: string; key?: string }
      const accountId = parsed.accountId?.trim() || parsed.account_id?.trim() || defaultAccountId
      const token = parsed.token?.trim() || parsed.key?.trim() || ""
      return accountId && token ? { accountId, token } : null
    } catch {
      return defaultAccountId ? { accountId: defaultAccountId, token: trimmed } : null
    }
  }

  const separatorIndex = trimmed.indexOf(":")
  if (separatorIndex > 0) {
    const accountId = trimmed.slice(0, separatorIndex).trim()
    const token = trimmed.slice(separatorIndex + 1).trim()
    return accountId && token ? { accountId, token } : null
  }

  return defaultAccountId ? { accountId: defaultAccountId, token: trimmed } : null
}

function readNumberEnv(name: string, defaultValue: number, bounds: { min: number; max: number }) {
  const raw = process.env[name]
  const parsed = raw === undefined || raw.trim() === "" ? defaultValue : Number(raw)

  if (!Number.isFinite(parsed)) {
    return defaultValue
  }

  return Math.min(bounds.max, Math.max(bounds.min, parsed))
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function buildSourceHeaderContext(rows: RawImportRow[], sourceHeaders: string[]) {
  return sourceHeaders.map((header) => ({
    header,
    sample_values: unique(
      rows
        .map((row) => row.raw_data?.[header])
        .filter((value) => value !== null && value !== undefined)
        .map((value) => truncate(String(value).replace(/\s+/g, " ").trim(), 80))
        .filter(Boolean)
    ).slice(0, 3),
  }))
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...<truncated>` : value
}
