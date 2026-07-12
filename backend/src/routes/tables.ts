import { Router } from "express"

import { appendRowSchema, savedRowPatchSchema, tableRowsQuerySchema } from "../lib/schemas.js"
import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "../server/api.js"
import { requireCurrentUser } from "../middleware/auth.js"
import { invalidateUserListCaches } from "../server/redis/cache.js"
import { store } from "../server/repositories/store.js"
import { logger } from "../lib/logger.js"

/**
 * Tables route — CRUD for saved rows within an import.
 *
 * GET    /all                    — List all saved rows across all imports
 * GET    /:importId/rows         — List saved rows for one import (paginated)
 * POST   /:importId/rows         — Append a new saved row
 * PATCH  /:importId/rows/:rowId  — Update a saved row's cleaned_data
 * DELETE /:importId/rows/:rowId  — Delete a saved row
 */

const router = Router()

router.get("/all", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const rows = await store.listAllSavedRowsForUser(user.id)
    const columns = new Set<string>()
    for (const row of rows) {
      for (const key of Object.keys(row.cleaned_data)) {
        columns.add(key)
      }
    }
    logger.debug({ userId: user.id, rows: rows.length, columns: columns.size }, "List all campaign rows")
    return jsonOk(res, { rows, columns: [...columns] })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.get("/:importId/rows", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { importId } = req.params
    const job = store.getImport(user.id, importId)

    if (!job) {
      return jsonError(res, "IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const query = tableRowsQuerySchema.parse(req.query)
    const allRows = await store.listSavedRows(user.id, importId)
    const filtered = allRows
      .filter((row) => (query.sheet ? row.sheet_name === query.sheet : true))
      .filter((row) =>
        query.search
          ? JSON.stringify(row.cleaned_data).toLowerCase().includes(query.search.toLowerCase())
          : true
      )
    const rows = filtered.slice(query.offset, query.offset + query.limit)

    logger.debug({ importId, total: filtered.length, returned: rows.length }, "List saved rows")
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
    logger.info({ userId: user.id, importId }, "Appending row")
    const row = store.appendSavedRow(user.id, importId, body)
    await store.addHistory(user.id, importId, "rows_added", { row_id: row.id })
    await invalidateUserListCaches(user.id)

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
    const row = await store.updateSavedRow(user.id, importId, rowId, body.cleaned_data)

    if (!row) {
      return jsonError(res, "ROW_NOT_FOUND", "Saved row not found.", 404)
    }

    logger.info({ userId: user.id, rowId }, "Updated saved row")
    await invalidateUserListCaches(user.id)
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

    const deleted = await store.deleteSavedRow(user.id, importId, rowId)

    if (!deleted) {
      return jsonError(res, "ROW_NOT_FOUND", "Saved row not found.", 404)
    }

    await store.addHistory(user.id, importId, "rows_deleted", { row_id: rowId })
    logger.info({ userId: user.id, rowId }, "Deleted saved row")
    await invalidateUserListCaches(user.id)

    return jsonOk(res, { deleted: true })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

export default router
