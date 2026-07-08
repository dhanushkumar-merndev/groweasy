import { getProcessedRows } from "@/server/ai/excel-cleaner"
import { handleRouteError, jsonError, jsonOk } from "@/server/api"
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser()
    const { id } = await context.params
    const job = store.getImport(user.id, id)

    if (!job) {
      return jsonError("IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const rows = await getProcessedRows(id, job.updated_at)

    return jsonOk({ rows })
  } catch (error) {
    return handleRouteError(error)
  }
}
