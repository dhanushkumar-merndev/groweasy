import { Router } from "express"

import { analyticsSuggestSchema } from "../lib/schemas.js"
import type { ChartType } from "../lib/types.js"
import { handleRouteError, jsonOk, parseJsonBody } from "../server/api.js"
import { requireCurrentUser } from "../middleware/auth.js"
import { logger } from "../lib/logger.js"
import { getUserDecryptedKey, shouldUseUserApiKey } from "./settings.js"

const router = Router()
const chartSuggestionTimeoutMs = Number(process.env.ANALYTICS_AI_TIMEOUT_MS ?? 15000)
const chartSuggestionMaxTokens = Number(process.env.ANALYTICS_AI_MAX_TOKENS ?? 1200)

router.post("/suggest-chart", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)
    const body = parseJsonBody(req.body, analyticsSuggestSchema)
    const suggestion = suggestChart(body.columns, body.sample_rows)
    const fallbackCharts = suggestChartLayout(body.columns, body.sample_rows, body.template_columns, body.column_profiles)
    const aiCharts = await suggestChartLayoutWithAi(user.id, body, fallbackCharts).catch((error) => {
      logger.warn({ importId: body.import_id, error }, "AI chart suggestion failed, using deterministic fallback")
      return null
    })
    const charts = aiCharts?.length ? aiCharts : fallbackCharts

    logger.info({
      importId: body.import_id,
      chartType: suggestion.chart_type,
      chartSource: aiCharts?.length ? "ai" : "deterministic",
      chartCount: charts.length,
      columns: body.columns,
    }, "Chart suggestion generated")
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
      charts,
      source: aiCharts?.length ? "ai" : "default",
    })
  } catch (error) {
    return handleRouteError(res, error)
  }
})

type AnalyticsSuggestBody = ReturnType<typeof analyticsSuggestSchema.parse>
type ChartSuggestion = {
  id: string
  title: string
  chart_type: ChartType
  x_axis: string
  y_axis: string
  layout: "wide" | "medium" | "compact"
  reason: string
}

async function suggestChartLayoutWithAi(
  userId: string,
  body: AnalyticsSuggestBody,
  fallbackCharts: ChartSuggestion[],
): Promise<ChartSuggestion[] | null> {
  const request = await buildAiRequest(userId)
  if (!request) return null

  const allowedColumns = new Set(body.columns)
  const promptPayload = {
    task: "Choose sensible CRM analytics chart blocks for this saved template. Return JSON only.",
    hard_rules: [
      "Use only columns listed in template_columns/columns.",
      "Every chart is a row count grouped by x_axis unless y_axis is a real numeric column.",
      "If a date/time column exists, include one wide line chart for lead count by that date.",
      "Use horizontal_bar for many text groups, bar for status/source/owner comparisons, pie only for 2-5 strong categories.",
      "Do not chart email, phone, mobile, ID, notes, or free-text description unless the profile shows useful repeated groups.",
      "Prefer business-useful CRM charts: created date trend, status/stage, source, owner, city, state, country, possession/time bucket.",
      "Avoid duplicate charts that explain the same idea.",
      "Return 4 to 8 charts when possible. Use wide for the most important trend/comparison, compact only for small splits.",
    ],
    columns: body.columns,
    template_columns: body.template_columns.map((column) => ({
      key: column.key,
      label: column.label,
      required: column.required,
      format_rules: column.format_rules,
      source_hints: column.source_hints,
    })),
    column_profiles: body.column_profiles,
    sample_rows: body.sample_rows.slice(0, 40),
    deterministic_fallback: fallbackCharts,
    output_shape: {
      charts: [
        {
          id: "column_key_or_short_unique_id",
          title: "Short human title",
          chart_type: "line | bar | pie | horizontal_bar | vertical_bar",
          x_axis: "existing_column_key",
          y_axis: "count",
          layout: "wide | medium | compact",
          reason: "Why this chart is useful for CRM analytics",
        },
      ],
    },
  }

  const content = await requestAiJson({
    ...request,
    system: [
      "You are an analytics designer for a CRM data-cleaning app.",
      "Your job is to map uploaded template columns to sensible chart blocks.",
      "Be conservative. Prefer useful business analytics over showing every available column.",
      "Return valid JSON only. No markdown.",
    ].join(" "),
    user: JSON.stringify(promptPayload),
  })
  const parsed = parseAiChartResponse(content)
  if (!parsed?.charts?.length) return null

  return parsed.charts
    .map((chart, index) => normalizeAiChart(chart, index, allowedColumns))
    .filter((chart): chart is ChartSuggestion => Boolean(chart))
    .slice(0, 8)
}

async function buildAiRequest(userId: string) {
  const userKey = await shouldUseUserApiKey(userId) ? await getUserDecryptedKey(userId) : null
  const provider = normalizeProvider(userKey?.provider ?? process.env.ANALYTICS_AI_PROVIDER ?? process.env.PRIMARY_AI_PROVIDER ?? "groq")
  const model = userKey?.model?.trim() || process.env.ANALYTICS_AI_MODEL?.trim() || process.env.PRIMARY_AI_MODEL?.trim() || (provider === "cloudflare" ? "@cf/google/gemma-4-26b-a4b-it" : provider === "commandcode" ? "deepseek/deepseek-v4-pro" : "openai/gpt-oss-120b")
  const apiKey = userKey?.key || firstEnvKey(
    provider === "cloudflare"
      ? ["CLOUDFLARE_API", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_KEY"]
      : provider === "commandcode"
        ? ["COMMAND_CODE_API_KEY", "COMMANDCODE_API_KEY"]
        : ["GROQ_API_KEY", "GROQ_API_KEYS"],
  )
  if (!apiKey) return null
  const baseUrl = provider === "commandcode"
    ? process.env.COMMAND_CODE_BASE_URL?.trim() || "https://api.commandcode.ai/provider/v1"
    : "https://api.groq.com/openai/v1"
  return { provider, model, apiKey, baseUrl }
}

async function requestAiJson(input: { provider: string; model: string; apiKey: string; baseUrl: string; system: string; user: string }) {
  if (input.provider === "cloudflare") {
    return requestCloudflareAnalyticsJson(input)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), chartSuggestionTimeoutMs)
  try {
    const response = await fetch(`${input.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: input.model,
        temperature: 0.1,
        max_tokens: chartSuggestionMaxTokens,
        response_format: { type: "json_object" },
        ...getAnalyticsModelOptions(input.model),
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
      }),
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`AI chart request failed with HTTP ${response.status}: ${text.slice(0, 300)}`)
    }
    const payload = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> }
    const content = payload.choices?.[0]?.message?.content
    if (!content) throw new Error("AI chart response was empty")
    return content
  } finally {
    clearTimeout(timeout)
  }
}

async function requestCloudflareAnalyticsJson(input: { model: string; apiKey: string; system: string; user: string }) {
  const credential = parseCloudflareCredential(input.apiKey)
  if (!credential) {
    throw new Error("Cloudflare account id is required for analytics AI. Set CLOUDFLARE_ACCOUNT_ID or save key as accountId:token.")
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), chartSuggestionTimeoutMs)
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${credential.accountId}/ai/v1/chat/completions`
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${credential.token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: input.model,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        temperature: 0,
        max_tokens: chartSuggestionMaxTokens,
      }),
    })
    const payload = await response.json().catch(() => ({})) as {
      error?: { message?: string }
      choices?: Array<{ message?: { content?: string } }>
    }
    if (!response.ok) {
      const message = payload.error?.message || `Cloudflare analytics request failed with HTTP ${response.status}`
      throw new Error(message)
    }

    const content = payload.choices?.[0]?.message?.content
    if (!content) throw new Error("Cloudflare analytics response was empty")
    return content
  } finally {
    clearTimeout(timeout)
  }
}

function parseAiChartResponse(content: string): { charts?: unknown[] } | null {
  try {
    return JSON.parse(content) as { charts?: unknown[] }
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0]) as { charts?: unknown[] }
    } catch {
      return null
    }
  }
}

function normalizeAiChart(chart: unknown, index: number, allowedColumns: Set<string>): ChartSuggestion | null {
  if (!chart || typeof chart !== "object") return null
  const source = chart as Record<string, unknown>
  const xAxis = String(source.x_axis ?? source.id ?? "").trim()
  if (!allowedColumns.has(xAxis)) return null
  const chartType = normalizeChartType(String(source.chart_type ?? ""))
  if (!chartType) return null
  const layout = normalizeLayout(String(source.layout ?? ""))
  return {
    id: String(source.id ?? xAxis).trim() || `${xAxis}_${index}`,
    title: String(source.title ?? `${labelize(xAxis)} breakdown`).trim().slice(0, 80),
    chart_type: chartType,
    x_axis: xAxis,
    y_axis: String(source.y_axis ?? "count").trim() || "count",
    layout,
    reason: String(source.reason ?? "Suggested from the uploaded CRM data profile.").trim().slice(0, 240),
  }
}

function normalizeChartType(value: string): ChartType | null {
  const normalized = value.toLowerCase().replace(/[\s-]+/g, "_")
  if (["line", "bar", "pie", "horizontal_bar", "vertical_bar", "area"].includes(normalized)) return normalized as ChartType
  if (normalized === "donut" || normalized === "doughnut") return "pie"
  return null
}

function normalizeLayout(value: string): ChartSuggestion["layout"] {
  return value === "compact" || value === "medium" || value === "wide" ? value : "medium"
}

function normalizeProvider(value: string) {
  const normalized = value.toLowerCase().replace(/[\s_-]/g, "")
  if (normalized === "cloudflare" || normalized === "workersai") return "cloudflare"
  return normalized === "commandcode" ? "commandcode" : "groq"
}

function firstEnvKey(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.split(",").map((key) => key.trim()).find(Boolean)
    if (value) return value
  }
  return ""
}

function parseCloudflareCredential(raw: string) {
  const trimmed = raw.trim()
  const defaultAccountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || process.env.CLOUDFLARE_ACCOUNT?.trim() || process.env.CF_ACCOUNT_ID?.trim() || ""

  if (!trimmed) return null

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { accountId?: string; account_id?: string; token?: string; key?: string }
      const accountId = parsed.accountId?.trim() || parsed.account_id?.trim() || defaultAccountId
      const token = parsed.token?.trim() || parsed.key?.trim() || ""
      return accountId && token ? { accountId, token } : null
    } catch {
      return defaultAccountId ? { accountId: defaultAccountId, token: trimmed } : null
    }
  }

  const separatorIndex = trimmed.indexOf(":")
  if (separatorIndex > 0) {
    const accountId = trimmed.slice(0, separatorIndex).trim()
    const token = trimmed.slice(separatorIndex + 1).trim()
    return accountId && token ? { accountId, token } : null
  }

  return defaultAccountId ? { accountId: defaultAccountId, token: trimmed } : null
}

function getAnalyticsModelOptions(model: string) {
  if (!supportsReasoningOptions(model)) return {}

  return {
    reasoning_effort: "medium" as const,
    reasoning_format: "hidden" as const,
  }
}

function supportsReasoningOptions(model: string) {
  const normalized = model.toLowerCase()
  return (
    normalized.includes("gpt-oss") ||
    normalized.includes("deepseek-r1") ||
    normalized.includes("qwq") ||
    normalized.includes("qwen")
  )
}

function suggestChartLayout(
  columns: string[],
  sampleRows: Array<Record<string, unknown>>,
  templateColumns: Array<{ key: string; label: string; source_hints?: string[] }>,
  columnProfiles: Array<{
    key: string
    label: string
    kind: string
    unique_count: number
    filled_count: number
    top_values: Array<{ name: string; value: number }>
  }>,
): ChartSuggestion[] {
  const profiles = columnProfiles.length
    ? columnProfiles
    : columns.map((column) => {
        const profile = profileColumn(column, sampleRows)
        return {
          key: profile.column,
          label: labelize(profile.column),
          kind: profile.isNumericLike ? "measure" : profile.isDateLike ? "time" : "dimension",
          unique_count: profile.uniqueCount,
          filled_count: sampleRows.length,
          top_values: [],
        }
      })
  const labelByKey = new Map(templateColumns.map((column) => [column.key, column.label]))

  return profiles
    .filter((profile) => profile.unique_count > 1 && profile.filled_count > 0)
    .filter((profile) => !["contact", "identity"].includes(profile.kind))
    .sort((a, b) => chartRank(a.kind) - chartRank(b.kind) || b.filled_count - a.filled_count)
    .slice(0, 6)
    .map((profile) => {
      const label = labelByKey.get(profile.key) ?? profile.label
      const chartType = chartTypeForProfile(profile.kind, profile.unique_count)

      return {
        id: profile.key,
        title: `${labelize(label)} breakdown`,
        chart_type: chartType,
        x_axis: profile.key,
        y_axis: "count",
        layout: layoutForProfile(profile.kind, profile.unique_count),
        reason: `Mapped from ${labelize(label)} because it has ${profile.unique_count} useful groups.`,
      }
    })
}

function chartTypeForProfile(kind: string, uniqueCount: number): ChartType {
  if (kind === "time") return "line"
  if (kind === "measure") return "bar"
  if (uniqueCount <= 5) return "pie"
  return "horizontal_bar"
}

function layoutForProfile(kind: string, uniqueCount: number): ChartSuggestion["layout"] {
  if (kind === "time" || kind === "measure" || uniqueCount > 6) return "wide"
  return uniqueCount > 4 ? "medium" : "compact"
}

function chartRank(kind: string) {
  const rank: Record<string, number> = {
    time: 0,
    dimension: 1,
    measure: 2,
  }

  return rank[kind] ?? 7
}

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
