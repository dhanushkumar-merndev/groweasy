import { cacheKeys, getCache } from "@/server/redis/cache"
import { handleRouteError, jsonError, jsonOk } from "@/server/api"
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"
import type { ValidationResult } from "@/lib/types"

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser()
    const { id } = await context.params
    const job = store.getImport(user.id, id)

    if (!job) {
      return jsonError("IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const validation = await getCache<ValidationResult>(cacheKeys(id).validation)

    if (!validation) {
      return jsonError("VALIDATION_EXPIRED", "The validation preview expired. Upload the file again.", 410)
    }

    store.setStatus(user.id, id, "validated")

    return jsonOk({ validation })
  } catch (error) {
    return handleRouteError(error)
  }
}
