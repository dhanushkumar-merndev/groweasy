import { cacheKeys, getCache } from "@/server/redis/cache"
import { handleRouteError, jsonError, jsonOk } from "@/server/api"
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"
import type { ValidationResult } from "@/lib/types"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser()
    const { id } = await context.params
    const job = store.getImport(user.id, id)

    if (!job) {
      return jsonError("IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const validation = await getCache<ValidationResult>(cacheKeys(id).validation, job.updated_at)

    return jsonOk({
      import: job,
      template: store.getTemplate(user.id, job.template_id),
      sheets: store.listSheets(id),
      validation,
      cleaned_rows: store.listCleanedRows(id),
      saved_rows: store.listSavedRows(user.id, id),
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
