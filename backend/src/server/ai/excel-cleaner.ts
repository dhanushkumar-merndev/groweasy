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
  excelCleanerSystemPrompt,
} from "./prompts/excel-cleaner.js"
import { cacheKeys, getCache, setCache } from "../redis/cache.js"
import { store } from "../repositories/store.js"
import { getUserDecryptedKey } from "../../routes/settings.js"
import { summarizeCleanedRows } from "../imports/summary.js"
import { logger } from "../../lib/logger.js"

const primaryModel = process.env.PRIMARY_AI_MODEL ?? "openai/gpt-oss-120b"
const fallbackModel = process.env.FALLBACK_AI_MODEL ?? "llama-3.3-70b-versatile"
const batchSize = Number(process.env.AI_BATCH_SIZE ?? 75)
const maxRetries = Number(process.env.AI_MAX_RETRIES ?? 2)

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
  onBatchStart?: (progress: BatchStart) => void | Promise<void>
  onBatchComplete?: (progress: BatchProgress) => void | Promise<void>
}) {
  const batches: AiBatchResult[] = []
  const rowBatches = chunk(input.rows, batchSize)
  const userKey = getUserDecryptedKey(input.userId)
  const groqApiKey = userKey?.key ?? process.env.GROQ_API_KEY ?? process.env.GROQ_MODEL_1 ?? process.env.GROQ_MODEL_2 ?? process.env.GROQ_MODEL_3
  const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null
  const allRows: CleanedRow[] = []
  let modelUsed = groq ? (userKey?.model || primaryModel) : "demo-local-cleaner"
  const tokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

  logger.info({ importId: input.importId, totalRows: input.rows.length, batchSize, totalBatches: rowBatches.length }, "Starting AI processing")

  await store.addHistory(input.userId, input.importId, "ai_processing_started", {
    total_rows: input.rows.length,
    prompt_version: EXCEL_CLEANER_PROMPT_VERSION,
  })

  for (const [batchIndex, rows] of rowBatches.entries()) {
    const batchNo = batchIndex + 1
    const localRows = cleanRowsWithTemplate(rows, input.template, {
      requireBothEmailPhone: input.requireBothEmailPhone,
    })
    const localRowsById = new Map(localRows.map((row) => [row.id, row]))
    const rowsNeedingAi = rows.filter((row) => shouldSendToAi(localRowsById.get(row.id)))

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

    const aiResult = groq && rowsNeedingAi.length > 0
      ? await cleanWithGroq({
          groq,
          rows: rowsNeedingAi,
          template: input.template,
          batchNo,
          requireBothEmailPhone: input.requireBothEmailPhone,
        }).catch(async (err) => {
          logger.warn({ batchNo, fallbackModel, err }, "Groq call failed, falling back to deterministic cleaning")
          modelUsed = fallbackModel
          return {
            rows: cleanRowsWithTemplate(rowsNeedingAi, input.template, {
              requireBothEmailPhone: input.requireBothEmailPhone,
            }),
            usage: null,
          }
        })
      : null
    const aiRows = aiResult?.rows ?? []
    if (aiResult?.usage) {
      tokenUsage.prompt_tokens += aiResult.usage.prompt_tokens
      tokenUsage.completion_tokens += aiResult.usage.completion_tokens
      tokenUsage.total_tokens += aiResult.usage.total_tokens
    }
    const aiRowsById = new Map(aiRows.map((row) => [row.id, row]))
    const cleanedRows = localRows.map((row) => aiRowsById.get(row.id) ?? row)

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

function shouldSendToAi(row: CleanedRow | undefined) {
  if (!row || row.status === "good") {
    return false
  }

  if (row.status === "missing") {
    return true
  }

  return row.skip_reason === "Could not map any meaningful value to the selected template."
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
  groq: Groq
  rows: RawImportRow[]
  template: Template
  batchNo: number
  requireBothEmailPhone?: boolean
}): Promise<{ rows: CleanedRow[]; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null }> {
  const localRows = cleanRowsWithTemplate(input.rows, input.template, {
    requireBothEmailPhone: input.requireBothEmailPhone,
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
  const userPayload = JSON.stringify({
    batch_no: input.batchNo,
    template: input.template.columns_config,
    rows: input.rows,
    output_shape: "AiBatchResult.rows only",
  })

  logger.info({
    batchNo: input.batchNo,
    templateHeaders,
    sourceHeaders,
    rowCount: input.rows.length,
    sampleRows: input.rows.slice(0, 3).map((row) => ({
      id: row.id,
      sheet: row.sheet_name,
      row: row.row_index,
      raw_data: row.raw_data,
    })),
  }, "AI request headers and row sample")

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const model = attempt === 0 ? primaryModel : fallbackModel
    logger.info({
      batchNo: input.batchNo,
      attempt,
      model,
      promptVersion: EXCEL_CLEANER_PROMPT_VERSION,
      payloadPreview: truncate(userPayload, 6000),
    }, "Calling Groq API")
    const response = await input.groq.chat.completions.create({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: excelCleanerSystemPrompt },
        { role: "user", content: userPayload },
      ],
    })
    const content = response.choices[0]?.message?.content
    logger.info({
      batchNo: input.batchNo,
      attempt,
      model,
      responsePreview: truncate(content ?? "", 6000),
      finishReason: response.choices[0]?.finish_reason,
      usage: response.usage,
    }, "Groq API response preview")

    if (!content) {
      logger.warn({ batchNo: input.batchNo, attempt }, "Groq returned empty content, retrying")
      continue
    }

    const parsed = parseGroqRows(content, localRows, input.template, {
      requireBothEmailPhone: input.requireBothEmailPhone,
    })

    if (parsed) {
      logger.info({
        batchNo: input.batchNo,
        attempt,
        model,
        parsedRows: parsed.length,
        parsedSample: parsed.slice(0, 3).map((row) => ({
          id: row.id,
          status: row.status,
          missing_fields: row.missing_fields,
          cleaned_data: row.cleaned_data,
          ai_changes: row.ai_changes,
        })),
      }, "Groq response parsed successfully")
      return { rows: parsed, usage: response.usage ?? null }
    }
  }

  logger.warn({ batchNo: input.batchNo }, "All Groq retries exhausted, using local fallback")
  return { rows: localRows, usage: null }
}

function parseGroqRows(
  content: string,
  fallbackRows: CleanedRow[],
  template: Template,
  options: { requireBothEmailPhone?: boolean } = {},
) {
  try {
    const parsed = JSON.parse(content) as { rows?: CleanedRow[] }

    if (!Array.isArray(parsed.rows)) {
      logger.warn("Groq response missing rows array")
      return null
    }

    const fallbackById = new Map(fallbackRows.map((row) => [row.id, row]))

    return parsed.rows.map((row) => normalizeAiRow(row, fallbackById.get(row.id), template, options))
  } catch {
    logger.warn("Failed to parse Groq JSON response")
    return null
  }
}

function normalizeAiRow(
  row: CleanedRow,
  fallbackRow: CleanedRow | undefined,
  template: Template,
  options: { requireBothEmailPhone?: boolean } = {},
): CleanedRow {
  const base = fallbackRow ?? row
  const inputData = row.cleaned_data ?? fallbackRow?.cleaned_data ?? {}
  const cleanedData = { ...inputData }

  for (const column of template.columns_config) {
    const currentValue = inputData[column.key] ?? ""
    const formatted = applyFormattingRules(sanitizeCellValue(currentValue), column.format_rules)
    cleanedData[column.key] = normalizeColumnValue(column.key, column.label, formatted)
  }

  const missingFields = getMissingFieldsForTemplate(template, cleanedData, options)

  return {
    ...base,
    ...row,
    cleaned_data: cleanedData,
    status: row.status === "skipped" ? "skipped" : missingFields.length > 0 ? "missing" : "good",
    missing_fields: row.status === "skipped" ? [] : missingFields,
    ai_changes: normalizeAiChanges(row.ai_changes ?? [], cleanedData),
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

function normalizeAiChanges(changes: CleanedRow["ai_changes"], cleanedData: CleanedRow["cleaned_data"]) {
  return changes.flatMap((change) => {
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

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...<truncated>` : value
}
