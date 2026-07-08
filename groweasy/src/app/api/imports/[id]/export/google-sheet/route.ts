import { googleSheetExportSchema } from "@/lib/schemas"
import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/server/api"
import { requireCurrentUser } from "@/server/auth/session"
import { exportRowsToGoogleSheet } from "@/server/google/sheets"
import { store } from "@/server/repositories/store"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser()
    const { id } = await context.params
    const body = await parseJsonBody(request, googleSheetExportSchema)
    const job = store.getImport(user.id, id)

    if (!job) {
      return jsonError("IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const template = store.getTemplate(user.id, job.template_id)

    if (!template) {
      return jsonError("TEMPLATE_NOT_FOUND", "Template not found.", 404)
    }

    const result = await exportRowsToGoogleSheet({
      spreadsheetId: body.spreadsheet_id,
      sheetName: body.sheet_name,
      rows: store.listSavedRows(user.id, id),
      template,
    })
    await store.addHistory(user.id, id, "google_sheet_export_done", result)

    return jsonOk(result)
  } catch (error) {
    return handleRouteError(error)
  }
}
