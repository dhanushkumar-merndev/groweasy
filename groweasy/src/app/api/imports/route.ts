import { uploadOptionsSchema } from "@/lib/schemas"
import { cacheKeys, setCache } from "@/server/redis/cache"
import { handleRouteError, jsonError, jsonOk } from "@/server/api"
import { parseWorkbook } from "@/server/imports/parser"
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"

const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv", ".tsv", ".ods"]

export async function GET() {
  try {
    const user = await requireCurrentUser()

    return jsonOk({ imports: store.listImports(user.id) })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser()
    const formData = await request.formData()
    const file = formData.get("file")
    const options = uploadOptionsSchema.parse({
      template_id: formData.get("template_id"),
      remove_blank_rows: formData.get("remove_blank_rows"),
      dash_values_blank: formData.get("dash_values_blank"),
    })

    if (!(file instanceof File)) {
      return jsonError("INVALID_FILE", "Upload an Excel, CSV, TSV, or ODS file.", 400)
    }

    if (!ALLOWED_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension))) {
      return jsonError("INVALID_FILE_TYPE", "Supported file types are .xlsx, .xls, .csv, .tsv, and .ods.", 400)
    }

    const template = store.getTemplate(user.id, options.template_id)

    if (!template) {
      return jsonError("TEMPLATE_NOT_FOUND", "Select a valid cleaning template.", 404)
    }

    const importId = crypto.randomUUID()
    const validation = parseWorkbook(await file.arrayBuffer(), {
      importId,
      removeBlankRows: options.remove_blank_rows,
      dashValuesBlank: options.dash_values_blank,
    })
    const job = store.createImport(user.id, {
      id: importId,
      templateId: template.id,
      fileName: file.name,
      rows: validation.rows,
      sheets: validation.sheets,
      blankRowsRemoved: validation.blank_rows_removed,
    })

    await setCache(cacheKeys(importId).raw, validation.rows)
    await setCache(cacheKeys(importId).validation, validation)

    return jsonOk({
      import: job,
      validation,
      next: `/upload/${importId}/validate`,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
