import { Router } from "express"

import { googleSheetExportSchema, googleSheetImportSchema } from "../lib/schemas.js"
import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "../server/api.js"
import { requireCurrentUser } from "../middleware/auth.js"
import { store } from "../server/repositories/store.js"
import { exportRowsToGoogleSheet, importRowsFromGoogleSheet } from "../server/google/sheets.js"
import { logger } from "../lib/logger.js"

const router = Router()

router.post("/export", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const body = parseJsonBody(req.body, googleSheetExportSchema)
    const job = store.getImport(user.id, body.import_id)

    if (!job) {
      return jsonError(res, "IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const template = await store.getTemplateForUser(user.id, job.template_id)

    if (!template) {
      return jsonError(res, "TEMPLATE_NOT_FOUND", "Template not found.", 404)
    }

    logger.info({ importId: body.import_id, spreadsheetId: body.spreadsheet_id }, "Google Sheets export requested")
    const result = await exportRowsToGoogleSheet({
      spreadsheetId: body.spreadsheet_id,
      sheetName: body.sheet_name,
      rows: await store.listSavedRows(user.id, body.import_id),
      template,
    })

    return jsonOk(res, result)
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.post("/import", async (req, res) => {
  try {
    await requireCurrentUser(req)
    const body = parseJsonBody(req.body, googleSheetImportSchema)
    const result = await importRowsFromGoogleSheet()

    logger.info({ spreadsheetId: body.spreadsheet_id, range: body.range }, "Google Sheets import requested")
    return jsonOk(res, {
      ...result,
      spreadsheet_id: body.spreadsheet_id,
      range: body.range,
      template_id: body.template_id,
    })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

export default router
