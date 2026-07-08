import { Router } from "express"
import multer from "multer"

import { uploadOptionsSchema, processImportSchema, saveImportSchema, exportExcelSchema, googleSheetExportSchema } from "../lib/schemas.js"
import type { AiBatchResult, RawImportRow, ValidationResult } from "../lib/types.js"
import { cacheKeys, getCache, invalidateImportCache, setCache } from "../server/redis/cache.js"
import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "../server/api.js"
import { parseWorkbook } from "../server/imports/parser.js"
import { requireCurrentUser } from "../middleware/auth.js"
import { store } from "../server/repositories/store.js"
import { processImportRows, getProcessedRows } from "../server/ai/excel-cleaner.js"
import { buildExcelExport } from "../server/imports/export.js"
import { exportRowsToGoogleSheet } from "../server/google/sheets.js"
import { logger } from "../lib/logger.js"

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })
const router = Router()

const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv", ".tsv", ".ods"]

router.get("/", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    logger.info({ userId: user.id }, "List imports")
    return jsonOk(res, { imports: store.listImports(user.id) })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.post("/", upload.single("file"), async (req, res) => {
  try {
    const user = await requireCurrentUser(req)

    if (!req.file) {
      logger.warn({ userId: user.id }, "Upload attempted without file")
      return jsonError(res, "INVALID_FILE", "Upload an Excel, CSV, TSV, or ODS file.", 400)
    }

    if (!ALLOWED_EXTENSIONS.some((ext) => req.file!.originalname.toLowerCase().endsWith(ext))) {
      logger.warn({ userId: user.id, filename: req.file!.originalname }, "Unsupported file type")
      return jsonError(res, "INVALID_FILE_TYPE", "Supported file types are .xlsx, .xls, .csv, .tsv, and .ods.", 400)
    }

    const options = uploadOptionsSchema.parse({
      template_id: req.body.template_id,
      remove_blank_rows: req.body.remove_blank_rows,
      dash_values_blank: req.body.dash_values_blank,
    })

    const template = store.getTemplate(user.id, options.template_id)

    if (!template) {
      logger.warn({ userId: user.id, templateId: options.template_id }, "Template not found for upload")
      return jsonError(res, "TEMPLATE_NOT_FOUND", "Select a valid cleaning template.", 404)
    }

    const importId = crypto.randomUUID()
    logger.info({ userId: user.id, importId, filename: req.file!.originalname, templateId: template.id }, "File upload started")
    const validation = parseWorkbook(new Uint8Array(req.file!.buffer).buffer as ArrayBuffer, {
      importId,
      removeBlankRows: options.remove_blank_rows,
      dashValuesBlank: options.dash_values_blank,
    })
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

router.get("/:id", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { id } = req.params
    const job = store.getImport(user.id, id)

    if (!job) {
      logger.warn({ userId: user.id, importId: id }, "Import not found")
      return jsonError(res, "IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const validation = await getCache<ValidationResult>(cacheKeys(id).validation, job.updated_at)

    return jsonOk(res, {
      import: job,
      template: store.getTemplate(user.id, job.template_id),
      sheets: store.listSheets(id),
      validation,
      cleaned_rows: store.listCleanedRows(id),
      saved_rows: store.listSavedRows(user.id, id),
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

    store.setStatus(user.id, id, "validated")
    logger.info({ userId: user.id, importId: id }, "Import validated")

    return jsonOk(res, { validation })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

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

    const template = store.getTemplate(user.id, job.template_id)
    const rows = await getCache<RawImportRow[]>(cacheKeys(id).raw)

    if (!template || !rows) {
      logger.warn({ importId: id }, "Preview expired during process")
      return jsonError(res, "PREVIEW_EXPIRED", "Raw preview data expired. Upload the file again.", 410)
    }

    if (body.force) {
      logger.info({ importId: id }, "Force re-processing, invalidating cache")
      await invalidateImportCache(id)
    }

    store.setStatus(user.id, id, "processing")
    const result = await processImportRows({
      userId: user.id,
      importId: id,
      template,
      rows,
      sheets: store.listSheets(id),
    })

    logger.info({ importId: id, modelUsed: result.modelUsed, batches: result.batches.length, rows: result.rows.length }, "Processing complete")
    return jsonOk(res, {
      import_id: id,
      model_used: result.modelUsed,
      batches: result.batches.length,
      rows: result.rows.length,
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

    const totalBatches = Math.max(1, Math.ceil(job.total_rows / Number(process.env.AI_BATCH_SIZE ?? 75)))

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    })

    let processedRows = 0
    let goodCount = 0
    let missingCount = 0
    let skippedCount = 0
    let aiChangedCount = 0

    logger.info({ importId: id, totalBatches }, "Starting SSE stream")

    for (let batchNo = 1; batchNo <= totalBatches; batchNo += 1) {
      const batch = await getCache<AiBatchResult>(cacheKeys(id).batch(batchNo))

      if (!batch) {
        continue
      }

      processedRows += batch.rows.length
      goodCount += batch.summary.good_count
      missingCount += batch.summary.missing_count
      skippedCount += batch.summary.skipped_count
      aiChangedCount += batch.summary.ai_changed_count

      res.write(`data: ${JSON.stringify({
        type: "batch_completed",
        batch_no: batchNo,
        total_batches: totalBatches,
        good_count: goodCount,
        missing_count: missingCount,
        skipped_count: skippedCount,
        ai_changed_count: aiChangedCount,
      })}\n\n`)

      res.write(`data: ${JSON.stringify({
        type: "progress",
        processed_rows: processedRows,
        total_rows: job.total_rows,
        percent: job.total_rows > 0 ? Math.round((processedRows / job.total_rows) * 100) : 100,
      })}\n\n`)

      await wait(250)
    }

    res.write(`data: ${JSON.stringify({
      type: "completed",
      import_id: id,
    })}\n\n`)

    res.end()
    logger.info({ importId: id }, "SSE stream complete")
  } catch (error) {
    return handleRouteError(res, error)
  }
})

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
    const savedRows = store.saveGoodRows(user.id, id, selectedRows)

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

    const template = store.getTemplate(user.id, job.template_id)

    if (!template) {
      return jsonError(res, "TEMPLATE_NOT_FOUND", "Template not found.", 404)
    }

    const rows = store.listSavedRows(user.id, id).filter((row) =>
      body.search
        ? JSON.stringify(row.cleaned_data).toLowerCase().includes(body.search.toLowerCase())
        : true
    )
    logger.info({ importId: id, mode: body.mode, rowCount: rows.length }, "Exporting to Excel")
    const buffer = buildExcelExport({
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

    const template = store.getTemplate(user.id, job.template_id)

    if (!template) {
      return jsonError(res, "TEMPLATE_NOT_FOUND", "Template not found.", 404)
    }

    logger.info({ importId: id, spreadsheetId: body.spreadsheet_id }, "Exporting to Google Sheets")
    const result = await exportRowsToGoogleSheet({
      spreadsheetId: body.spreadsheet_id,
      sheetName: body.sheet_name,
      rows: store.listSavedRows(user.id, id),
      template,
    })
    await store.addHistory(user.id, id, "google_sheet_export_done", result)

    return jsonOk(res, result)
  } catch (error) {
    return handleRouteError(res, error)
  }
})

export default router

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
