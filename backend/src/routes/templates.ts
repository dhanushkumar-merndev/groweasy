import { Router } from "express"

import { templateInputSchema } from "../lib/schemas.js"
import { handleRouteError, jsonOk, parseJsonBody } from "../server/api.js"
import { requireCurrentUser } from "../middleware/auth.js"
import { store } from "../server/repositories/store.js"

const router = Router()

router.get("/", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
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
      name: body.name,
      columns_config: body.columns_config,
      formatting_rules: body.formatting_rules,
    })

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
      return jsonOk(res, { template: null })
    }

    const body = parseJsonBody(req.body, templateInputSchema)
    const template = store.upsertTemplate(user.id, {
      id,
      name: body.name,
      columns_config: body.columns_config,
      formatting_rules: body.formatting_rules,
      created_at: existing.created_at,
    })

    return jsonOk(res, { template })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

router.delete("/:id", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const { id } = req.params
    const deleted = store.deleteTemplate(user.id, id)

    if (!deleted) {
      return jsonOk(res, { deleted: false })
    }

    return jsonOk(res, { deleted: true })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

export default router
