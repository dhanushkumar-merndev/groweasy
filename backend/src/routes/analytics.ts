import { Router } from "express"

import { analyticsSuggestSchema } from "../lib/schemas.js"
import type { ChartType } from "../lib/types.js"
import { handleRouteError, jsonOk, parseJsonBody } from "../server/api.js"
import { requireCurrentUser } from "../middleware/auth.js"
import { logger } from "../lib/logger.js"

const router = Router()

router.post("/suggest-chart", async (req, res) => {
  try {
    await requireCurrentUser(req)
    const body = parseJsonBody(req.body, analyticsSuggestSchema)
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

    logger.info({ importId: body.import_id, chartType: chart_type, columns: body.columns }, "Chart suggestion generated")
    return jsonOk(res, {
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
    return handleRouteError(res, error)
  }
})

export default router
