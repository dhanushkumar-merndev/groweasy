import { Router } from "express"

import { handleRouteError, jsonOk } from "../server/api.js"
import { requireCurrentUser } from "../middleware/auth.js"
import { store } from "../server/repositories/store.js"
import { logger } from "../lib/logger.js"

const router = Router()

const EXPORT_ACTIONS = new Set(["export_done", "google_sheet_export_done"])

router.get("/", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const type = req.query.type as string | undefined

    let history = await store.listHistory(user.id)

    if (type === "export") {
      history = history.filter((entry) => EXPORT_ACTIONS.has(entry.action))
    }

    logger.info({ userId: user.id, type, count: history.length }, "List history")
    return jsonOk(res, { history })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

export default router
