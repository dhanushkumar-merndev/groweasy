import { Router } from "express"

import { handleRouteError, jsonOk } from "../server/api.js"
import { requireCurrentUser } from "../middleware/auth.js"
import { store } from "../server/repositories/store.js"
import { logger } from "../lib/logger.js"

const router = Router()

router.get("/", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    logger.info({ userId: user.id }, "List history")
    return jsonOk(res, { history: store.listHistory(user.id) })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

export default router
