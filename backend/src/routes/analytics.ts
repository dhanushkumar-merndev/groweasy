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
    const suggestion = suggestChart(body.columns, body.sample_rows)

    logger.info({ importId: body.import_id, chartType: suggestion.chart_type, columns: body.columns }, "Chart suggestion generated")
    return jsonOk(res, {
      suggestion: {
        import_id: body.import_id,
        chart_type: suggestion.chart_type,
        title: suggestion.title,
        x_axis: suggestion.x_axis,
        y_axis: suggestion.y_axis,
        group_by: suggestion.group_by,
        filters: body.filters,
        reason: suggestion.reason,
      },
    })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

export default router

function suggestChart(columns: string[], sampleRows: Array<Record<string, unknown>>) {
  const fallbackColumn = columns[0] ?? "source"
  const profiles = columns.map((column) => profileColumn(column, sampleRows))
  const dateColumn = profiles.find((profile) => profile.isDateLike)
  const statusColumn = profiles.find((profile) => profile.isStatusLike && profile.uniqueCount <= 8)
  const locationColumn = profiles.find((profile) => profile.isLocationLike)
  const numericColumn = profiles.find((profile) => profile.numericCount >= Math.max(2, Math.ceil(sampleRows.length / 2)))
  const categoryColumn = profiles.find((profile) => !profile.isNumericLike && profile.uniqueCount > 1)

  if (dateColumn && numericColumn) {
    return {
      chart_type: "area" as ChartType,
      title: `${labelize(numericColumn.column)} over time`,
      x_axis: dateColumn.column,
      y_axis: numericColumn.column,
      group_by: categoryColumn?.column,
      reason: "The samples include date-like values plus a numeric field, so an area chart can show trend and volume.",
    }
  }

  if (dateColumn) {
    return {
      chart_type: "line" as ChartType,
      title: `${labelize(fallbackColumn)} trend`,
      x_axis: dateColumn.column,
      y_axis: "count",
      group_by: categoryColumn?.column,
      reason: "The selected rows include a date-like field, which fits a line trend.",
    }
  }

  if (statusColumn) {
    return {
      chart_type: "pie" as ChartType,
      title: `${labelize(statusColumn.column)} split`,
      x_axis: statusColumn.column,
      y_axis: "count",
      group_by: undefined,
      reason: "The samples show a small set of status values, which works well as a pie chart.",
    }
  }

  if (locationColumn) {
    return {
      chart_type: "horizontal_bar" as ChartType,
      title: `${labelize(locationColumn.column)} comparison`,
      x_axis: locationColumn.column,
      y_axis: "count",
      group_by: undefined,
      reason: "Location/category names are easier to scan in a horizontal bar chart.",
    }
  }

  return {
    chart_type: "vertical_bar" as ChartType,
    title: `${labelize(categoryColumn?.column ?? fallbackColumn)} comparison`,
    x_axis: categoryColumn?.column ?? fallbackColumn,
    y_axis: "count",
    group_by: undefined,
    reason: "Category counts are best compared with a vertical bar chart.",
  }
}

function profileColumn(column: string, sampleRows: Array<Record<string, unknown>>) {
  const lower = column.toLowerCase()
  const values = sampleRows
    .map((row) => row[column])
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
    .map((value) => String(value).trim())
  const uniqueCount = new Set(values.map((value) => value.toLowerCase())).size
  const numericCount = values.filter((value) => Number.isFinite(Number(value.replace(/,/g, "")))).length
  const dateCount = values.filter((value) => Number.isFinite(Date.parse(value))).length

  return {
    column,
    uniqueCount,
    numericCount,
    isNumericLike: numericCount > 0 || ["amount", "price", "revenue", "total", "count", "qty", "quantity"].some((part) => lower.includes(part)),
    isDateLike: dateCount > 0 || ["date", "time", "created", "updated"].some((part) => lower.includes(part)),
    isStatusLike: ["status", "stage", "state", "type"].some((part) => lower.includes(part)),
    isLocationLike: ["city", "state", "country", "location", "area", "region"].some((part) => lower.includes(part)),
  }
}

function labelize(column: string) {
  return column
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}
