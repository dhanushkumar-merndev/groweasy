import { Router } from "express"

import { handleRouteError, jsonError, jsonOk } from "../server/api.js"
import { requireCurrentUser } from "../middleware/auth.js"
import { store } from "../server/repositories/store.js"
import { logger } from "../lib/logger.js"

const router = Router()

router.get("/", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    logger.info({ userId: user.id }, "List templates")
    return jsonOk(res, { templates: store.listTemplates(user.id) })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.post("/", async (req, res) => {
  try {
    await requireCurrentUser(req)
    return jsonError(res, "TEMPLATE_LOCKED", "Use the default Grow Easy CRM template.", 403)
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.get("/:id", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { id } = req.params
    const template = store.getTemplate(user.id, id)

    if (!template) {
      return jsonOk(res, { template: null })
    }

    return jsonOk(res, { template })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.patch("/:id", async (req, res) => {
  try {
    await requireCurrentUser(req)
    return jsonError(res, "TEMPLATE_LOCKED", "The default template cannot be edited.", 403)
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.delete("/:id", async (req, res) => {
  try {
    await requireCurrentUser(req)
    return jsonError(res, "TEMPLATE_LOCKED", "The default template cannot be deleted.", 403)
  } catch (error) {
    return handleRouteError(res, error)
  }
})

export default router
