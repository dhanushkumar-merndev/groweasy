import { appendRowSchema, tableRowsQuerySchema } from "@/lib/schemas"
import { handleRouteError, jsonError, jsonOk, parseJsonBody, parseSearchParams } from "@/server/api"
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"

export async function GET(request: Request, context: { params: Promise<{ importId: string }> }) {
  try {
    const user = await requireCurrentUser()
    const { importId } = await context.params
    const query = parseSearchParams(request, tableRowsQuerySchema)
    const job = store.getImport(user.id, importId)

    if (!job) {
      return jsonError("IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const filtered = store
      .listSavedRows(user.id, importId)
      .filter((row) => (query.sheet ? row.sheet_name === query.sheet : true))
      .filter((row) =>
        query.search
          ? JSON.stringify(row.cleaned_data).toLowerCase().includes(query.search.toLowerCase())
          : true
      )
    const rows = filtered.slice(query.offset, query.offset + query.limit)

    return jsonOk({
      rows,
      total: filtered.length,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request, context: { params: Promise<{ importId: string }> }) {
  try {
    const user = await requireCurrentUser()
    const { importId } = await context.params
    const job = store.getImport(user.id, importId)

    if (!job) {
      return jsonError("IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const body = await parseJsonBody(request, appendRowSchema)
    const row = store.appendSavedRow(user.id, importId, body)
    await store.addHistory(user.id, importId, "rows_added", { row_id: row.id })

    return jsonOk({ row }, { status: 201 })
  } catch (error) {
    return handleRouteError(error)
  }
}
