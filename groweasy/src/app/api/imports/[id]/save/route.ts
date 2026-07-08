import { saveImportSchema } from "@/lib/schemas"
import { getProcessedRows } from "@/server/ai/excel-cleaner"
import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/server/api"
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser()
    const { id } = await context.params
    const body = await parseJsonBody(request, saveImportSchema)
    const job = store.getImport(user.id, id)

    if (!job) {
      return jsonError("IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const rows = body.rows ?? (await getProcessedRows(id, job.updated_at))
    const selectedRows = body.row_ids ? rows.filter((row) => body.row_ids?.includes(row.id)) : rows
    const savedRows = store.saveGoodRows(user.id, id, selectedRows)

    store.updateImport(user.id, id, {
      status: "saved",
      final_saved_count: savedRows.length,
      fixed_missing_count: selectedRows.filter((row) => row.status === "good" && row.missing_fields.length > 0).length,
    })

    return jsonOk({ saved_rows: savedRows.length })
  } catch (error) {
    return handleRouteError(error)
  }
}
