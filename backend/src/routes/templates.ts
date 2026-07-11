import { Router } from "express"

import { templateInputSchema } from "../lib/schemas.js"
import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "../server/api.js"
import { requireCurrentUser } from "../middleware/auth.js"
import { store } from "../server/repositories/store.js"
import { logger } from "../lib/logger.js"
import { demoUserId } from "../lib/data/sample-data.js"

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
    const user = await requireCurrentUser(req)
    const body = parseJsonBody(req.body, templateInputSchema)
    const template = store.upsertTemplate(user.id, {
      id: crypto.randomUUID(),
      ...body,
    })

    logger.info({ userId: user.id, templateId: template.id }, "Template created")
    return jsonOk(res, { template }, 201)
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
    const user = await requireCurrentUser(req)
    const { id } = req.params
    const existing = store.getTemplate(user.id, id)

    if (!existing) {
      return jsonError(res, "TEMPLATE_NOT_FOUND", "Template not found.", 404)
    }

    if (existing.user_id === demoUserId) {
      return jsonError(res, "TEMPLATE_LOCKED", "The default template cannot be edited.", 403)
    }

    const body = parseJsonBody(req.body, templateInputSchema)
    const template = store.upsertTemplate(user.id, {
      id,
      created_at: existing.created_at,
      ...body,
    })

    logger.info({ userId: user.id, templateId: id }, "Template updated")
    return jsonOk(res, { template })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.delete("/:id", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { id } = req.params
    const existing = store.getTemplate(user.id, id)

    if (!existing) {
      return jsonError(res, "TEMPLATE_NOT_FOUND", "Template not found.", 404)
    }

    if (existing.user_id === demoUserId) {
      return jsonError(res, "TEMPLATE_LOCKED", "The default template cannot be deleted.", 403)
    }

    const deleted = store.deleteTemplate(user.id, id)
    return jsonOk(res, { deleted })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

export default router
