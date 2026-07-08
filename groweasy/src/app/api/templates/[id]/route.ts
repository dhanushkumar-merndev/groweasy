import { templateInputSchema } from "@/lib/schemas"
import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/server/api"
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser()
    const { id } = await context.params
    const template = store.getTemplate(user.id, id)

    if (!template) {
      return jsonError("TEMPLATE_NOT_FOUND", "Template not found.", 404)
    }

    return jsonOk({ template })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser()
    const { id } = await context.params
    const existing = store.getTemplate(user.id, id)

    if (!existing) {
      return jsonError("TEMPLATE_NOT_FOUND", "Template not found.", 404)
    }

    const body = await parseJsonBody(request, templateInputSchema)
    const template = store.upsertTemplate(user.id, {
      id,
      name: body.name,
      columns_config: body.columns_config,
      formatting_rules: body.formatting_rules,
      created_at: existing.created_at,
    })

    return jsonOk({ template })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser()
    const { id } = await context.params
    const deleted = store.deleteTemplate(user.id, id)

    if (!deleted) {
      return jsonError("TEMPLATE_NOT_FOUND", "Template not found.", 404)
    }

    return jsonOk({ deleted: true })
  } catch (error) {
    return handleRouteError(error)
  }
}
