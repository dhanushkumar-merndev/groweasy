import Groq from "groq-sdk"

import { cleanRowsWithTemplate } from "../../lib/formatting.js"
import type { AiBatchResult, CleanedRow, ImportSheet, RawImportRow, Template } from "../../lib/types.js"
import {
  EXCEL_CLEANER_PROMPT_VERSION,
  excelCleanerSystemPrompt,
} from "./prompts/excel-cleaner.js"
import { cacheKeys, getCache, setCache } from "../redis/cache.js"
import { store } from "../repositories/store.js"
import { summarizeCleanedRows } from "../imports/summary.js"

const primaryModel = process.env.PRIMARY_AI_MODEL ?? "openai/gpt-oss-120b"
const fallbackModel = process.env.FALLBACK_AI_MODEL ?? "llama-3.3-70b-versatile"
const batchSize = Number(process.env.AI_BATCH_SIZE ?? 75)
const maxRetries = Number(process.env.AI_MAX_RETRIES ?? 2)

type ProcessingResult = {
  rows: CleanedRow[]
  batches: AiBatchResult[]
  modelUsed: string
}

export async function processImportRows(input: {
  userId: string
  importId: string
  template: Template
  rows: RawImportRow[]
  sheets: ImportSheet[]
}) {
  const batches: AiBatchResult[] = []
  const rowBatches = chunk(input.rows, batchSize)
  const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null
  const allRows: CleanedRow[] = []
  let modelUsed = groq ? primaryModel : "demo-local-cleaner"

  await store.addHistory(input.userId, input.importId, "ai_processing_started", {
    total_rows: input.rows.length,
    prompt_version: EXCEL_CLEANER_PROMPT_VERSION,
  })

  for (const [batchIndex, rows] of rowBatches.entries()) {
    const batchNo = batchIndex + 1
    const cleanedRows = groq
      ? await cleanWithGroq({ groq, rows, template: input.template, batchNo }).catch(async () => {
          modelUsed = fallbackModel
          return cleanRowsWithTemplate(rows, input.template)
        })
      : cleanRowsWithTemplate(rows, input.template)

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

    batches.push(batchResult)
    await setCache(cacheKeys(input.importId).batch(batchNo), batchResult)
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

  return {
    rows: allRows,
    batches,
    modelUsed,
  } satisfies ProcessingResult
}

export async function getProcessedRows(importId: string, updatedAt?: string) {
  return (await getCache<CleanedRow[]>(cacheKeys(importId).formatted, updatedAt)) ?? store.listCleanedRows(importId)
}

async function cleanWithGroq(input: {
  groq: Groq
  rows: RawImportRow[]
  template: Template
  batchNo: number
}) {
  const localRows = cleanRowsWithTemplate(input.rows, input.template)
  const userPayload = JSON.stringify({
    batch_no: input.batchNo,
    template: input.template.columns_config,
    rows: input.rows,
    output_shape: "AiBatchResult.rows only",
  })

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await input.groq.chat.completions.create({
      model: attempt === 0 ? primaryModel : fallbackModel,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: excelCleanerSystemPrompt },
        { role: "user", content: userPayload },
      ],
    })
    const content = response.choices[0]?.message?.content

    if (!content) {
      continue
    }

    const parsed = parseGroqRows(content, localRows)

    if (parsed) {
      return parsed
    }
  }

  return localRows
}

function parseGroqRows(content: string, fallbackRows: CleanedRow[]) {
  try {
    const parsed = JSON.parse(content) as { rows?: CleanedRow[] }

    if (!Array.isArray(parsed.rows)) {
      return null
    }

    const fallbackById = new Map(fallbackRows.map((row) => [row.id, row]))

    return parsed.rows.map((row) => ({
      ...(fallbackById.get(row.id) ?? row),
      cleaned_data: row.cleaned_data ?? fallbackById.get(row.id)?.cleaned_data ?? {},
      status: row.status ?? fallbackById.get(row.id)?.status ?? "missing",
      missing_fields: row.missing_fields ?? [],
      ai_changes: row.ai_changes ?? [],
    }))
  } catch {
    return null
  }
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}
