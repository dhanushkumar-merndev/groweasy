import { savedRowPatchSchema } from "@/lib/schemas"
import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/server/api"
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"

export async function PATCH(request: Request, context: { params: Promise<{ importId: string; rowId: string }> }) {
  try {
    const user = await requireCurrentUser()
    const { importId, rowId } = await context.params
    const job = store.getImport(user.id, importId)

    if (!job) {
      return jsonError("IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const body = await parseJsonBody(request, savedRowPatchSchema)
    const row = store.updateSavedRow(user.id, rowId, body.cleaned_data)

    if (!row) {
      return jsonError("ROW_NOT_FOUND", "Saved row not found.", 404)
    }

    return jsonOk({ row })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ importId: string; rowId: string }> }) {
  try {
    const user = await requireCurrentUser()
    const { importId, rowId } = await context.params
    const job = store.getImport(user.id, importId)

    if (!job) {
      return jsonError("IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const deleted = store.deleteSavedRow(user.id, rowId)

    if (!deleted) {
      return jsonError("ROW_NOT_FOUND", "Saved row not found.", 404)
    }

    await store.addHistory(user.id, importId, "rows_deleted", { row_id: rowId })

    return jsonOk({ deleted: true })
  } catch (error) {
    return handleRouteError(error)
  }
}
