import { Router, type Response } from "express"
import multer from "multer"

import { uploadOptionsSchema, processImportSchema, saveImportSchema, exportExcelSchema, googleSheetExportSchema, validateImportSchema } from "../lib/schemas.js"
import type { ImportSheet, RawImportRow, ValidationResult, ValidationWarning } from "../lib/types.js"
import { cacheKeys, getCache, invalidateProcessedImportCache, setCache } from "../server/redis/cache.js"
import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "../server/api.js"
import { parseWorkbook } from "../server/imports/parser.js"
import { requireCurrentUser } from "../middleware/auth.js"
import { store } from "../server/repositories/store.js"
import { processImportRows, getProcessedRows } from "../server/ai/excel-cleaner.js"
import { buildExcelExport } from "../server/imports/export.js"
import { learnTemplateSourceHints } from "../server/imports/source-hints.js"
import { exportRowsToGoogleSheet } from "../server/google/sheets.js"
import { getUserAiSettings, hasActiveUserApiKey } from "./settings.js"
import { logger } from "../lib/logger.js"

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })
const router = Router()

const ALLOWED_EXTENSIONS = [".xlsx", ".csv", ".tsv"]
const DEFAULT_API_ROW_LIMIT = 10
const maxConcurrentAiImports = readNumberEnv("AI_MAX_CONCURRENT_IMPORTS", 3, { min: 1, max: 10 })
const activeAiImports = new Set<string>()

router.get("/", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    logger.info({ userId: user.id }, "List imports")
    return jsonOk(res, { imports: await store.listImportsForUser(user.id) })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.post("/", upload.single("file"), async (req, res) => {
  try {
    const user = await requireCurrentUser(req)

    if (!req.file) {
      logger.warn({ userId: user.id }, "Upload attempted without file")
      return jsonError(res, "INVALID_FILE", "Upload an XLSX, CSV, or TSV file.", 400)
    }

    if (!ALLOWED_EXTENSIONS.some((ext) => req.file!.originalname.toLowerCase().endsWith(ext))) {
      logger.warn({ userId: user.id, filename: req.file!.originalname }, "Unsupported file type")
      return jsonError(res, "INVALID_FILE_TYPE", "Supported file types are .xlsx, .csv, and .tsv.", 400)
    }

    const options = uploadOptionsSchema.parse({
      template_id: req.body.template_id,
      remove_blank_rows: req.body.remove_blank_rows,
      dash_values_blank: req.body.dash_values_blank,
    })

    const template = await store.getTemplateForUser(user.id, options.template_id)

    if (!template) {
      logger.warn({ userId: user.id, templateId: options.template_id }, "Template not found for upload")
      return jsonError(res, "TEMPLATE_NOT_FOUND", "Select a valid cleaning template.", 404)
    }

    const importId = crypto.randomUUID()
    logger.info({ userId: user.id, importId, filename: req.file!.originalname, templateId: template.id }, "File upload started")
    const validation = await parseWorkbook(new Uint8Array(req.file!.buffer).buffer as ArrayBuffer, {
      importId,
      fileName: req.file!.originalname,
      removeBlankRows: options.remove_blank_rows,
      dashValuesBlank: options.dash_values_blank,
    })
    if (await isOverDefaultApiRowLimit(user.id, validation.rows.length)) {
      return jsonError(res, "DEFAULT_API_ROW_LIMIT", getDefaultApiRowLimitMessage(validation.rows.length), 403)
    }

    const job = store.createImport(user.id, {
      id: importId,
      templateId: template.id,
      fileName: req.file!.originalname,
      rows: validation.rows,
      sheets: validation.sheets,
      blankRowsRemoved: validation.blank_rows_removed,
    })

    await setCache(cacheKeys(importId).raw, validation.rows)
    await setCache(cacheKeys(importId).validation, validation)

    logger.info({ userId: user.id, importId, totalRows: validation.rows.length }, "File upload completed")
    return jsonOk(res, {
      import: job,
      validation,
      next: `/upload/${importId}/validate`,
    })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.post("/batch", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)

    const templateId = req.body.template_id
    const fileName = req.body.file_name || "Grow Easy CRM"
    const rawRows = req.body.rows || []
    const sheets = req.body.sheets || []
    const blankRowsRemoved = req.body.blank_rows_removed || 0
    const removeBlankRows = req.body.remove_blank_rows !== false
    const dashValuesBlank = req.body.dash_values_blank !== false
    const requireBothEmailPhone = req.body.require_both_email_phone === true
    const generateDescription = req.body.generate_description === true
    const correctSpelling = req.body.correct_spelling === true

    const template = await store.getTemplateForUser(user.id, templateId)

    if (!template) {
      logger.warn({ userId: user.id, templateId }, "Template not found for batch upload")
      return jsonError(res, "TEMPLATE_NOT_FOUND", "Select a valid cleaning template.", 404)
    }

    const importId = req.body.id || crypto.randomUUID()
    logger.info({ userId: user.id, importId, filename: fileName, templateId }, "Batch import started")

    const mappedRows: RawImportRow[] = rawRows.map((row: any) => {
      const sheetIndex = typeof row.sheet_index === "number" ? row.sheet_index : typeof row.source_sheet_index === "number" ? row.source_sheet_index : 0
      const rowIndex = typeof row.row_index === "number" ? row.row_index : typeof row.source_row_index === "number" ? row.source_row_index : 1
      const sheetName = row.sheet_name || row.source_sheet || "Upload"

      return {
        id: row.id || `${importId}_${sheetIndex}_${rowIndex}`,
        import_id: importId,
        sheet_id: row.sheet_id || `${importId}_sheet_${sheetIndex + 1}`,
        sheet_name: sheetName,
        sheet_index: sheetIndex,
        row_index: rowIndex,
        raw_data: row.raw_data || row.data || {},
      }
    })
    if (await isOverDefaultApiRowLimit(user.id, mappedRows.length)) {
      return jsonError(res, "DEFAULT_API_ROW_LIMIT", getDefaultApiRowLimitMessage(mappedRows.length), 403)
    }

    const mappedSheets: ImportSheet[] = sheets.map((sheet: any, idx: number) => ({
      id: sheet.id || `${importId}_sheet_${typeof sheet.sheet_index === "number" ? sheet.sheet_index + 1 : idx + 1}`,
      import_id: importId,
      sheet_name: sheet.sheet_name || sheet.name || `Sheet ${idx + 1}`,
      sheet_index: typeof sheet.sheet_index === "number" ? sheet.sheet_index : idx,
      total_rows: sheet.total_rows || sheet.rows || 0,
      good_count: 0,
      missing_count: 0,
      skipped_count: 0,
      created_at: new Date().toISOString(),
    }))

    const existingJob = store.getImport(user.id, importId)

    if (existingJob) {
      logger.info({ userId: user.id, importId }, "Import already exists, updating cache")
      await setCache(cacheKeys(importId).raw, mappedRows)
      await setCache(cacheKeys(importId).validation, {
        import_id: importId,
        rows: mappedRows,
        sheets: mappedSheets,
        warnings: [],
        blank_rows_removed: blankRowsRemoved,
        total_rows: mappedRows.length,
        remove_blank_rows: removeBlankRows,
        dash_values_blank: dashValuesBlank,
        require_both_email_phone: requireBothEmailPhone,
        generate_description: generateDescription,
        correct_spelling: correctSpelling,
      })
      return jsonOk(res, {
        import: existingJob,
        validation: {
          import_id: importId,
          rows: mappedRows,
          sheets: mappedSheets,
          warnings: [],
          blank_rows_removed: blankRowsRemoved,
          total_rows: mappedRows.length,
          remove_blank_rows: removeBlankRows,
          dash_values_blank: dashValuesBlank,
          require_both_email_phone: requireBothEmailPhone,
          generate_description: generateDescription,
          correct_spelling: correctSpelling,
        },
        next: `/upload/${importId}/validate`,
      })
    }

    const job = store.createImport(user.id, {
      id: importId,
      templateId,
      fileName,
      rows: mappedRows,
      sheets: mappedSheets,
      blankRowsRemoved,
    })

    await setCache(cacheKeys(importId).raw, mappedRows)

    const validation = {
      import_id: importId,
      rows: mappedRows,
      sheets: mappedSheets,
      warnings: [],
      blank_rows_removed: blankRowsRemoved,
      total_rows: mappedRows.length,
      remove_blank_rows: removeBlankRows,
      dash_values_blank: dashValuesBlank,
      require_both_email_phone: requireBothEmailPhone,
      generate_description: generateDescription,
      correct_spelling: correctSpelling,
    }
    await setCache(cacheKeys(importId).validation, validation)

    logger.info({ userId: user.id, importId, totalRows: mappedRows.length }, "Batch import completed")
    return jsonOk(res, {
      import: job,
      validation,
      next: `/upload/${importId}/validate`,
    })
  } catch (error) {
    return handleRouteError(res, error)
  }
})


router.get("/:id", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { id } = req.params
    const job = store.getImport(user.id, id)

    if (!job) {
      logger.warn({ userId: user.id, importId: id }, "Import not found")
      return jsonError(res, "IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const validation = await getCache<ValidationResult>(cacheKeys(id).validation)

    return jsonOk(res, {
      import: job,
      template: await store.getTemplateForUser(user.id, job.template_id),
      sheets: store.listSheets(id),
      validation,
      cleaned_rows: store.listCleanedRows(id),
      saved_rows: await store.listSavedRows(user.id, id),
    })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.post("/:id/validate", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { id } = req.params
    const job = store.getImport(user.id, id)

    if (!job) {
      logger.warn({ userId: user.id, importId: id }, "Import not found for validation")
      return jsonError(res, "IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const validation = await getCache<ValidationResult>(cacheKeys(id).validation)

    if (!validation) {
      logger.warn({ importId: id }, "Validation expired")
      return jsonError(res, "VALIDATION_EXPIRED", "The validation preview expired. Upload the file again.", 410)
    }

    const body = parseJsonBody(req.body ?? {}, validateImportSchema)
    const rows = body.rows?.map((row) => ({
      ...row,
      import_id: id,
      sheet_id: row.sheet_id.startsWith("_sheet_") ? `${id}_sheet_${row.sheet_index + 1}` : row.sheet_id,
    })) ?? validation.rows
    const blankRowsRemoved = body.rows ? body.blank_rows_removed : validation.blank_rows_removed
    const removeBlankRows = body.rows ? body.remove_blank_rows : validation.remove_blank_rows
    const dashValuesBlank = body.rows ? body.dash_values_blank : validation.dash_values_blank
    const requireBothEmailPhone = body.rows ? body.require_both_email_phone : validation.require_both_email_phone
    const generateDescription = body.rows ? body.generate_description : validation.generate_description
    const correctSpelling = body.rows ? body.correct_spelling : validation.correct_spelling
    const sheets = body.rows ? summarizeSheets(validation.sheets, rows) : validation.sheets
    if (await isOverDefaultApiRowLimit(user.id, rows.length)) {
      return jsonError(res, "DEFAULT_API_ROW_LIMIT", getDefaultApiRowLimitMessage(rows.length), 403)
    }

    const warnings = mergeBlankRowWarning(validation.warnings, blankRowsRemoved)
    const nextValidation: ValidationResult = {
      ...validation,
      rows,
      sheets,
      warnings,
      blank_rows_removed: blankRowsRemoved,
      total_rows: rows.length,
      remove_blank_rows: removeBlankRows,
      dash_values_blank: dashValuesBlank,
      require_both_email_phone: requireBothEmailPhone,
      generate_description: generateDescription,
      correct_spelling: correctSpelling,
    }

    store.setSheets(id, sheets)
    store.updateImport(user.id, id, {
      status: "validated",
      total_rows: rows.length,
      blank_rows_removed: blankRowsRemoved,
      sheet_summary: sheets.map((sheet) => ({
        sheet_id: sheet.id,
        sheet_name: sheet.sheet_name,
        sheet_index: sheet.sheet_index,
        total_rows: sheet.total_rows,
        good_count: sheet.good_count,
        missing_count: sheet.missing_count,
        skipped_count: sheet.skipped_count,
      })),
    })
    await setCache(cacheKeys(id).raw, rows)
    await setCache(cacheKeys(id).validation, nextValidation)

    logger.info({ userId: user.id, importId: id }, "Import validated")

    return jsonOk(res, { validation: nextValidation })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

function summarizeSheets(existingSheets: ImportSheet[], rows: RawImportRow[]) {
  const counts = new Map<string, number>()
  const rowSheets = new Map<string, Pick<ImportSheet, "id" | "import_id" | "sheet_name" | "sheet_index">>()

  for (const row of rows) {
    counts.set(row.sheet_id, (counts.get(row.sheet_id) ?? 0) + 1)
    rowSheets.set(row.sheet_id, {
      id: row.sheet_id,
      import_id: row.import_id,
      sheet_name: row.sheet_name,
      sheet_index: row.sheet_index,
    })
  }

  const sheetsById = new Map(existingSheets.map((sheet) => [sheet.id, sheet]))
  const now = new Date().toISOString()

  return [...counts.entries()]
    .map(([sheetId, totalRows]) => {
      const existingSheet = sheetsById.get(sheetId)
      const rowSheet = rowSheets.get(sheetId)

      return {
        id: sheetId,
        import_id: existingSheet?.import_id ?? rowSheet?.import_id ?? "",
        sheet_name: existingSheet?.sheet_name ?? rowSheet?.sheet_name ?? "Upload",
        sheet_index: existingSheet?.sheet_index ?? rowSheet?.sheet_index ?? 0,
        total_rows: totalRows,
        good_count: existingSheet?.good_count ?? 0,
        missing_count: existingSheet?.missing_count ?? 0,
        skipped_count: existingSheet?.skipped_count ?? 0,
        created_at: existingSheet?.created_at ?? now,
      }
    })
    .sort((left, right) => left.sheet_index - right.sheet_index)
}

function mergeBlankRowWarning(warnings: ValidationWarning[], blankRowsRemoved: number) {
  const nextWarnings = warnings.filter((warning) => warning.code !== "blank_rows_removed")

  if (blankRowsRemoved > 0) {
    nextWarnings.push({
      code: "blank_rows_removed",
      message: `${blankRowsRemoved} blank row${blankRowsRemoved === 1 ? "" : "s"} removed.`,
      count: blankRowsRemoved,
    })
  }

  return nextWarnings
}

async function isOverDefaultApiRowLimit(userId: string, rowCount: number) {
  if (rowCount <= DEFAULT_API_ROW_LIMIT) {
    return false
  }

  return !(await hasActiveUserApiKey(userId))
}

function getDefaultApiRowLimitMessage(rowCount: number) {
  return `Default API mode supports up to ${DEFAULT_API_ROW_LIMIT} data rows per upload (${rowCount.toLocaleString()} found). Add and enable your own API key in Settings to process larger files.`
}

router.post("/:id/process", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { id } = req.params
    const body = parseJsonBody(req.body, processImportSchema)
    const job = store.getImport(user.id, id)

    if (!job) {
      logger.warn({ userId: user.id, importId: id }, "Import not found for processing")
      return jsonError(res, "IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const template = await store.getTemplateForUser(user.id, job.template_id)
    const rows = await getCache<RawImportRow[]>(cacheKeys(id).raw)
    const validation = await getCache<ValidationResult>(cacheKeys(id).validation)

    if (!template || !rows) {
      logger.warn({ importId: id }, "Preview expired during process")
      return jsonError(res, "PREVIEW_EXPIRED", "Raw preview data expired. Upload the file again.", 410)
    }
    if (await isOverDefaultApiRowLimit(user.id, rows.length)) {
      return jsonError(res, "DEFAULT_API_ROW_LIMIT", getDefaultApiRowLimitMessage(rows.length), 403)
    }

    if (body.force) {
      logger.info({ importId: id }, "Force re-processing, invalidating processed cache")
      await invalidateProcessedImportCache(id)
    }

    const releaseAiSlot = tryAcquireAiSlot(id)

    if (!releaseAiSlot) {
      return jsonError(res, "AI_BUSY", "AI processing is busy. Please retry in a minute.", 429)
    }

    let result: Awaited<ReturnType<typeof processImportRows>>
    try {
      store.setStatus(user.id, id, "processing")
      result = await processImportRows({
        userId: user.id,
        importId: id,
        template,
        rows,
        sheets: store.listSheets(id),
        requireBothEmailPhone: validation?.require_both_email_phone ?? false,
        generateDescription: validation?.generate_description ?? false,
        correctSpelling: validation?.correct_spelling ?? false,
      })
    } finally {
      releaseAiSlot()
    }

    await store.addTemplateSourceHints(user.id, template.id, learnTemplateSourceHints({
      template,
      rawRows: rows,
      cleanedRows: result.rows,
    }))

    logger.info({ importId: id, modelUsed: result.modelUsed, batches: result.batches.length, rows: result.rows.length, tokenUsage: result.tokenUsage }, "Processing complete")
    return jsonOk(res, {
      import_id: id,
      model_used: result.modelUsed,
      batches: result.batches.length,
      rows: result.rows.length,
      token_usage: result.tokenUsage,
    })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.get("/:id/stream", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { id } = req.params
    const job = store.getImport(user.id, id)

    if (!job) {
      return jsonError(res, "IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const template = await store.getTemplateForUser(user.id, job.template_id)
    const rows = await getCache<RawImportRow[]>(cacheKeys(id).raw)
    const validation = await getCache<ValidationResult>(cacheKeys(id).validation)

    if (!template || !rows) {
      logger.warn({ importId: id }, "Preview expired during processing stream")
      return jsonError(res, "PREVIEW_EXPIRED", "Raw preview data expired. Upload the file again.", 410)
    }
    if (await isOverDefaultApiRowLimit(user.id, rows.length)) {
      return jsonError(res, "DEFAULT_API_ROW_LIMIT", getDefaultApiRowLimitMessage(rows.length), 403)
    }

    if (req.query.force === "1" || req.query.force === "true") {
      logger.info({ importId: id }, "Force streaming re-processing, invalidating processed cache")
      await invalidateProcessedImportCache(id)
    }

    const releaseAiSlot = tryAcquireAiSlot(id)

    if (!releaseAiSlot) {
      return jsonError(res, "AI_BUSY", "AI processing is busy. Please retry in a minute.", 429)
    }

    const aiSettings = await getUserAiSettings(user.id)
    const totalBatches = Math.max(1, Math.ceil(rows.length / aiSettings.batchSize))
    const totalRows = rows.length

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    })
    res.flushHeaders()
    res.socket?.setNoDelay(true)
    writeSse(res, { type: "connected" })

    store.setStatus(user.id, id, "processing")

    let goodCount = 0
    let missingCount = 0
    let skippedCount = 0
    let aiChangedCount = 0
    let previousPromptTokens = 0
    let previousCompletionTokens = 0
    let previousTotalTokens = 0
    let closed = false

    req.on("close", () => {
      closed = true
    })

    logger.info({ importId: id, totalBatches }, "Starting SSE stream")

    let result: Awaited<ReturnType<typeof processImportRows>>
    try {
      result = await processImportRows({
        userId: user.id,
        importId: id,
        template,
        rows,
        sheets: store.listSheets(id),
        requireBothEmailPhone: validation?.require_both_email_phone ?? false,
        generateDescription: validation?.generate_description ?? false,
        correctSpelling: validation?.correct_spelling ?? false,
        onBatchStart: async ({ batchNo, batchRows, aiRows, model }) => {
          if (closed) return

          writeSse(res, {
            type: "batch_started",
            batch_no: batchNo,
            total_batches: totalBatches,
            batch_rows: batchRows,
            ai_rows: aiRows,
            model,
          })
        },
        onBatchComplete: async ({ batch, batchNo, processedRows, tokenUsage, aiRows, aiUsed }) => {
          if (closed) return

          goodCount += batch.summary.good_count
          missingCount += batch.summary.missing_count
          skippedCount += batch.summary.skipped_count
          aiChangedCount += batch.summary.ai_changed_count

          writeSse(res, {
            type: "batch_completed",
            batch_no: batchNo,
            total_batches: totalBatches,
            good_count: goodCount,
            missing_count: missingCount,
            skipped_count: skippedCount,
            ai_changed_count: aiChangedCount,
            batch_good_count: batch.summary.good_count,
            batch_missing_count: batch.summary.missing_count,
            batch_skipped_count: batch.summary.skipped_count,
            batch_ai_changed_count: batch.summary.ai_changed_count,
            batch_output_rows: batch.rows.length,
            ai_rows: aiRows,
            ai_used: aiUsed,
            batch_token_usage: {
              prompt_tokens: Math.max(0, tokenUsage.prompt_tokens - previousPromptTokens),
              completion_tokens: Math.max(0, tokenUsage.completion_tokens - previousCompletionTokens),
              total_tokens: Math.max(0, tokenUsage.total_tokens - previousTotalTokens),
            },
          })

          previousPromptTokens = tokenUsage.prompt_tokens
          previousCompletionTokens = tokenUsage.completion_tokens
          previousTotalTokens = tokenUsage.total_tokens

          writeSse(res, {
            type: "progress",
            processed_rows: processedRows,
            total_rows: totalRows,
            percent: totalRows > 0 ? Math.round((processedRows / totalRows) * 100) : 100,
          })

          if (tokenUsage.total_tokens > 0) {
            writeSse(res, {
              type: "token_usage",
              token_usage: tokenUsage,
            })
          }
        },
      })
    } finally {
      releaseAiSlot()
    }
    await store.addTemplateSourceHints(user.id, template.id, learnTemplateSourceHints({
      template,
      rawRows: rows,
      cleanedRows: result.rows,
    }))

    if (!closed) {
      writeSse(res, {
        type: "completed",
        import_id: id,
        token_usage: result.tokenUsage,
      })
    }

    if (!closed) {
      res.end()
    }
    logger.info({ importId: id, tokenUsage: result.tokenUsage }, "SSE stream complete")
  } catch (error) {
    if (res.headersSent) {
      logger.error({ err: error }, "SSE stream failed")
      writeSse(res, {
        type: "error",
        message: error instanceof Error ? error.message : "Processing failed.",
      })
      res.end()
      return
    }

    return handleRouteError(res, error)
  }
})

function writeSse(res: Response, payload: unknown) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
  ;(res as Response & { flush?: () => void }).flush?.()
}

function tryAcquireAiSlot(importId: string) {
  if (activeAiImports.has(importId)) {
    return null
  }

  if (activeAiImports.size >= maxConcurrentAiImports) {
    logger.warn({ importId, active: activeAiImports.size, max: maxConcurrentAiImports }, "AI processing concurrency limit reached")
    return null
  }

  activeAiImports.add(importId)
  logger.info({ importId, active: activeAiImports.size, max: maxConcurrentAiImports }, "AI processing slot acquired")

  return () => {
    activeAiImports.delete(importId)
    logger.info({ importId, active: activeAiImports.size, max: maxConcurrentAiImports }, "AI processing slot released")
  }
}

function readNumberEnv(name: string, fallback: number, bounds: { min: number; max: number }) {
  const parsed = Number(process.env[name])

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.min(Math.max(Math.trunc(parsed), bounds.min), bounds.max)
}

router.get("/:id/results", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { id } = req.params
    const job = store.getImport(user.id, id)

    if (!job) {
      return jsonError(res, "IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const rows = await getProcessedRows(id, job.updated_at)
    logger.debug({ importId: id, rowCount: rows.length }, "Returning processed results")

    return jsonOk(res, { rows })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.post("/:id/save", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { id } = req.params
    const body = parseJsonBody(req.body, saveImportSchema)
    const job = store.getImport(user.id, id)

    if (!job) {
      return jsonError(res, "IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const rows = body.rows ?? (await getProcessedRows(id, job.updated_at))
    const selectedRows = body.row_ids ? rows.filter((row) => body.row_ids?.includes(row.id)) : rows
    const savedRows = await store.saveGoodRows(user.id, id, selectedRows)

    store.updateImport(user.id, id, {
      status: "saved",
      final_saved_count: savedRows.length,
      fixed_missing_count: selectedRows.filter((row) => row.status === "good" && row.missing_fields.length > 0).length,
    })

    logger.info({ importId: id, savedCount: savedRows.length }, "Rows saved")
    return jsonOk(res, { saved_rows: savedRows.length })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.post("/:id/export/excel", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { id } = req.params
    const body = parseJsonBody(req.body, exportExcelSchema)
    const job = store.getImport(user.id, id)

    if (!job) {
      return jsonError(res, "IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const template = await store.getTemplateForUser(user.id, job.template_id)

    if (!template) {
      return jsonError(res, "TEMPLATE_NOT_FOUND", "Template not found.", 404)
    }

    let rows = await store.listSavedRows(user.id, id)

    if (rows.length === 0) {
      rows = store.listCleanedRows(id).map((row) => ({
        id: row.id,
        user_id: user.id,
        import_id: id,
        sheet_id: row.sheet_id,
        sheet_name: row.sheet_name,
        sheet_index: row.sheet_index,
        row_index: row.row_index,
        cleaned_data: row.cleaned_data,
        ai_changes: row.ai_changes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))
    }

    rows = rows.filter((row) =>
      body.search
        ? JSON.stringify(row.cleaned_data).toLowerCase().includes(body.search.toLowerCase())
        : true
    )
    logger.info({ importId: id, mode: body.mode, rowCount: rows.length }, "Exporting to Excel")
    const buffer = await buildExcelExport({
      rows,
      template,
      mode: body.mode,
      sheetName: body.sheet_name,
    })
    await store.addHistory(user.id, id, "export_done", {
      rows: rows.length,
      mode: body.mode,
    })

    res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    res.set("Content-Disposition", `attachment; filename="${job.import_name || "cleaned-data"}.xlsx"`)
    res.send(Buffer.from(buffer))
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.post("/:id/export/google-sheet", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { id } = req.params
    const body = parseJsonBody(req.body, googleSheetExportSchema)
    const job = store.getImport(user.id, id)

    if (!job) {
      return jsonError(res, "IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const template = await store.getTemplateForUser(user.id, job.template_id)

    if (!template) {
      return jsonError(res, "TEMPLATE_NOT_FOUND", "Template not found.", 404)
    }

    logger.info({ importId: id, spreadsheetId: body.spreadsheet_id }, "Exporting to Google Sheets")
    const result = await exportRowsToGoogleSheet({
      spreadsheetId: body.spreadsheet_id,
      sheetName: body.sheet_name,
      rows: await store.listSavedRows(user.id, id),
      template,
    })
    await store.addHistory(user.id, id, "google_sheet_export_done", result)

    return jsonOk(res, result)
  } catch (error) {
    return handleRouteError(res, error)
  }
})

export default router
