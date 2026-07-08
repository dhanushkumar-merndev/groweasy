import { templateInputSchema } from "@/lib/schemas"
import { handleRouteError, jsonOk, parseJsonBody } from "@/server/api"
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"

export async function GET() {
  try {
    const user = await requireCurrentUser()

    return jsonOk({ templates: store.listTemplates(user.id) })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser()
    const body = await parseJsonBody(request, templateInputSchema)
    const template = store.upsertTemplate(user.id, {
      id: crypto.randomUUID(),
      name: body.name,
      columns_config: body.columns_config,
      formatting_rules: body.formatting_rules,
    })

    return jsonOk({ template }, { status: 201 })
  } catch (error) {
    return handleRouteError(error)
  }
}
