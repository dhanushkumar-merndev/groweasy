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

const primaryModel = process.env.PRIMARY_AI_MODEL ?? "openai/gpt-oss-120b"
const fallbackModel = process.env.FALLBACK_AI_MODEL ?? "llama-3.3-70b-versatile"
const maxRetries = Number(process.env.AI_MAX_RETRIES ?? 2)
const maxCompletionTokens = Number(process.env.AI_MAX_COMPLETION_TOKENS ?? 2048)
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
  batchTokenUsage: ProcessingResult["tokenUsage"]
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
  const allKeys = [
    userKey?.key,
    process.env.GROQ_API_KEY,
    process.env.GROQ_MODEL_1,
    process.env.GROQ_MODEL_2,
    process.env.GROQ_MODEL_3,
  ].map((key) => key?.trim()).filter(Boolean) as string[]
  const groqClients = allKeys.length > 0 ? allKeys.map((k) => new Groq({ apiKey: k })) : []
  const allRows: CleanedRow[] = []
  let modelUsed = groqClients.length > 0 ? (userKey?.model || primaryModel) : "demo-local-cleaner"
  const tokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

  logger.info({ importId: input.importId, totalRows: input.rows.length, aiSettings, totalBatches: rowBatches.length }, "Starting AI processing")

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
    const localRowsById = new Map(localRows.map((row) => [row.id, row]))
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

    const aiResult = groqClients.length > 0 && rowsNeedingAi.length > 0
        ? await cleanWithGroq({
          groqClients,
          rows: rowsNeedingAi,
          template: input.template,
          batchNo,
          aiRequestBatchSize: aiSettings.requestBatchSize,
          requireBothEmailPhone: input.requireBothEmailPhone,
          generateDescription: input.generateDescription,
          correctSpelling: input.correctSpelling,
          detailedReviewEnabled: aiSettings.detailedReviewEnabled || input.correctSpelling === true || input.generateDescription === true,
        }).catch(async (err) => {
          logger.warn({ batchNo, err }, "All Groq keys exhausted, falling back to deterministic cleaning")
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
    const batchTokenUsage = aiResult?.usage
      ? { ...aiResult.usage }
      : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

    if (batchTokenUsage.total_tokens > 0) {
      tokenUsage.prompt_tokens += batchTokenUsage.prompt_tokens
      tokenUsage.completion_tokens += batchTokenUsage.completion_tokens
      tokenUsage.total_tokens += batchTokenUsage.total_tokens
      logger.info({ batchNo, usage: batchTokenUsage, accumulated: { ...tokenUsage } }, "Token usage accumulated")
    }
    const aiRowsById = new Map(aiRows.map((row) => [row.id, row]))
    const cleanedRows = localRows
      .map((row) => aiRowsById.get(row.id) ?? row)
      .map((row) => enforceGeneratedDescription(row, input.template, input.generateDescription))

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
      batchTokenUsage,
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
  const models = unique([primaryModel, fallbackModel].filter(Boolean))
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

function enforceGeneratedDescription(row: CleanedRow, template: Template, generateDescription = false) {
  if (!generateDescription) {
    return row
  }

  const descriptionKey = getDescriptionColumnKey(template)

  if (!descriptionKey || row.status === "skipped" || hasText(row.cleaned_data[descriptionKey])) {
    return row
  }

  return {
    ...row,
    ai_changes: row.ai_changes.filter((change) => change.field !== descriptionKey),
  }
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
