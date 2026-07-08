import { googleSheetImportSchema } from "@/lib/schemas"
import { handleRouteError, jsonOk, parseJsonBody } from "@/server/api"
import { requireCurrentUser } from "@/server/auth/session"
import { importRowsFromGoogleSheet } from "@/server/google/sheets"

export async function POST(request: Request) {
  try {
    await requireCurrentUser()
    const body = await parseJsonBody(request, googleSheetImportSchema)
    const result = await importRowsFromGoogleSheet()

    return jsonOk({
      ...result,
      spreadsheet_id: body.spreadsheet_id,
      range: body.range,
      template_id: body.template_id,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
