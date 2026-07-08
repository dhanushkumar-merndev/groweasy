import { processImportSchema } from "@/lib/schemas"
import type { RawImportRow } from "@/lib/types"
import { processImportRows } from "@/server/ai/excel-cleaner"
import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/server/api"
import { requireCurrentUser } from "@/server/auth/session"
import { cacheKeys, getCache, invalidateImportCache } from "@/server/redis/cache"
import { store } from "@/server/repositories/store"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser()
    const { id } = await context.params
    const body = await parseJsonBody(request, processImportSchema)
    const job = store.getImport(user.id, id)

    if (!job) {
      return jsonError("IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const template = store.getTemplate(user.id, job.template_id)
    const rows = await getCache<RawImportRow[]>(cacheKeys(id).raw)

    if (!template || !rows) {
      return jsonError("PREVIEW_EXPIRED", "Raw preview data expired. Upload the file again.", 410)
    }

    if (body.force) {
      await invalidateImportCache(id)
    }

    store.setStatus(user.id, id, "processing")
    const result = await processImportRows({
      userId: user.id,
      importId: id,
      template,
      rows,
      sheets: store.listSheets(id),
    })

    return jsonOk({
      import_id: id,
      model_used: result.modelUsed,
      batches: result.batches.length,
      rows: result.rows.length,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
