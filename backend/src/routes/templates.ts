import { Router } from "express"

import { templateInputSchema } from "../lib/schemas.js"
import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "../server/api.js"
import { requireCurrentUser } from "../middleware/auth.js"
import { getOrSetUserListCache, invalidateUserListCaches, userListCacheKeys } from "../server/redis/cache.js"
import { store } from "../server/repositories/store.js"
import { logger } from "../lib/logger.js"
import { systemUserId } from "../lib/default-template.js"

const router = Router()

router.get("/", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    logger.info({ userId: user.id }, "List templates")
    const templates = await getOrSetUserListCache(
      userListCacheKeys(user.id).templates,
      () => store.listTemplatesForUser(user.id),
    )
    return jsonOk(res, { templates })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.post("/", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const body = parseJsonBody(req.body, templateInputSchema)

    const nameTaken = (await store.listTemplatesForUser(user.id)).some(
      (t) => t.name.toLowerCase().trim() === body.name.toLowerCase().trim()
    )
    if (nameTaken) {
      return jsonError(res, "TEMPLATE_NAME_EXISTS", "A template with this name already exists.", 409)
    }

    const template = await store.upsertTemplateForUser(user.id, {
      id: crypto.randomUUID(),
      ...body,
    })
    await invalidateUserListCaches(user.id)

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
    const template = await store.getTemplateForUser(user.id, id)

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
    const existing = await store.getTemplateForUser(user.id, id)

    if (!existing) {
      return jsonError(res, "TEMPLATE_NOT_FOUND", "Template not found.", 404)
    }

    if (existing.user_id === systemUserId) {
      return jsonError(res, "TEMPLATE_LOCKED", "The default template cannot be edited.", 403)
    }

    const body = parseJsonBody(req.body, templateInputSchema)

    const nameTaken = (await store.listTemplatesForUser(user.id)).some(
      (t) => t.id !== id && t.name.toLowerCase().trim() === body.name.toLowerCase().trim()
    )
    if (nameTaken) {
      return jsonError(res, "TEMPLATE_NAME_EXISTS", "A template with this name already exists.", 409)
    }

    const template = await store.upsertTemplateForUser(user.id, {
      id,
      created_at: existing.created_at,
      ...body,
    })
    await invalidateUserListCaches(user.id)

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
    const existing = await store.getTemplateForUser(user.id, id)

    if (!existing) {
      return jsonError(res, "TEMPLATE_NOT_FOUND", "Template not found.", 404)
    }

    if (existing.user_id === systemUserId) {
      return jsonError(res, "TEMPLATE_LOCKED", "The default template cannot be deleted.", 403)
    }

    const deleted = await store.deleteTemplateForUser(user.id, id)
    await invalidateUserListCaches(user.id)
    return jsonOk(res, { deleted })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

export default router
