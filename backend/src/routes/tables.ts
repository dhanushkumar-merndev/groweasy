import { Router } from "express"

import { appendRowSchema, savedRowPatchSchema, tableRowsQuerySchema } from "../lib/schemas.js"
import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "../server/api.js"
import { requireCurrentUser } from "../middleware/auth.js"
import { store } from "../server/repositories/store.js"

const router = Router()

router.get("/:importId/rows", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { importId } = req.params
    const job = store.getImport(user.id, importId)

    if (!job) {
      return jsonError(res, "IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const query = tableRowsQuerySchema.parse(req.query)
    const filtered = store
      .listSavedRows(user.id, importId)
      .filter((row) => (query.sheet ? row.sheet_name === query.sheet : true))
      .filter((row) =>
        query.search
          ? JSON.stringify(row.cleaned_data).toLowerCase().includes(query.search.toLowerCase())
          : true
      )
    const rows = filtered.slice(query.offset, query.offset + query.limit)

    return jsonOk(res, {
      rows,
      total: filtered.length,
    })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.post("/:importId/rows", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { importId } = req.params
    const job = store.getImport(user.id, importId)

    if (!job) {
      return jsonError(res, "IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const body = parseJsonBody(req.body, appendRowSchema)
    const row = store.appendSavedRow(user.id, importId, body)
    await store.addHistory(user.id, importId, "rows_added", { row_id: row.id })

    return jsonOk(res, { row }, 201)
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.patch("/:importId/rows/:rowId", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { importId, rowId } = req.params
    const job = store.getImport(user.id, importId)

    if (!job) {
      return jsonError(res, "IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const body = parseJsonBody(req.body, savedRowPatchSchema)
    const row = store.updateSavedRow(user.id, rowId, body.cleaned_data)

    if (!row) {
      return jsonError(res, "ROW_NOT_FOUND", "Saved row not found.", 404)
    }

    return jsonOk(res, { row })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.delete("/:importId/rows/:rowId", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { importId, rowId } = req.params
    const job = store.getImport(user.id, importId)

    if (!job) {
      return jsonError(res, "IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const deleted = store.deleteSavedRow(user.id, rowId)

    if (!deleted) {
      return jsonError(res, "ROW_NOT_FOUND", "Saved row not found.", 404)
    }

    await store.addHistory(user.id, importId, "rows_deleted", { row_id: rowId })

    return jsonOk(res, { deleted: true })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

export default router
