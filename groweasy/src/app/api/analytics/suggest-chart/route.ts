import { analyticsSuggestSchema } from "@/lib/schemas"
import type { ChartType } from "@/lib/types"
import { handleRouteError, jsonOk, parseJsonBody } from "@/server/api"
import { requireCurrentUser } from "@/server/auth/session"

export async function POST(request: Request) {
  try {
    await requireCurrentUser()
    const body = await parseJsonBody(request, analyticsSuggestSchema)
    const lowerColumns = body.columns.map((column) => column.toLowerCase())
    const hasDate = lowerColumns.some((column) => column.includes("date") || column.includes("time"))
    const hasStatus = lowerColumns.some((column) => column.includes("status") || column.includes("stage"))
    const hasLocation = lowerColumns.some((column) => ["city", "state", "location"].some((part) => column.includes(part)))
    const chart_type: ChartType = hasDate
      ? "line"
      : hasStatus
        ? "pie"
        : hasLocation
          ? "horizontal_bar"
          : "bar"

    return jsonOk({
      suggestion: {
        import_id: body.import_id,
        chart_type,
        title: hasDate ? "Lead trend over time" : "Saved row comparison",
        x_axis: body.columns[0] ?? "source",
        y_axis: "count",
        group_by: body.columns[1],
        filters: body.filters,
        reason: hasDate
          ? "A date-like column works best as a line trend."
          : hasStatus
            ? "A status-like column works best as a percentage chart."
            : "Category counts are easiest to compare in a bar chart.",
      },
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
