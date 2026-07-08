import { exportExcelSchema } from "@/lib/schemas"
import { buildExcelExport } from "@/server/imports/export"
import { handleRouteError, jsonError, parseJsonBody } from "@/server/api"
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser()
    const { id } = await context.params
    const body = await parseJsonBody(request, exportExcelSchema)
    const job = store.getImport(user.id, id)

    if (!job) {
      return jsonError("IMPORT_NOT_FOUND", "Import not found.", 404)
    }

    const template = store.getTemplate(user.id, job.template_id)

    if (!template) {
      return jsonError("TEMPLATE_NOT_FOUND", "Template not found.", 404)
    }

    const rows = store.listSavedRows(user.id, id).filter((row) =>
      body.search
        ? JSON.stringify(row.cleaned_data).toLowerCase().includes(body.search.toLowerCase())
        : true
    )
    const buffer = buildExcelExport({
      rows,
      template,
      mode: body.mode,
      sheetName: body.sheet_name,
    })
    await store.addHistory(user.id, id, "export_done", {
      rows: rows.length,
      mode: body.mode,
    })

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${job.import_name || "cleaned-data"}.xlsx"`,
      },
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
