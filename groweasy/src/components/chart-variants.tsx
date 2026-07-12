"use client"

import { useEffect, useMemo, useState } from "react"
import type { DateRange } from "react-day-picker"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from "recharts"
import { Loader2Icon, MenuIcon, PlusIcon, SparklesIcon, TrashIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DatePickerWithRange } from "@/components/date-picker-with-range"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { api } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import type { SavedRow, Template, TemplateColumn } from "@/lib/types"

const chartConfig = {
  value: {
    label: "Rows",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

type ChartVariant = "line" | "bar" | "pie" | "horizontal_bar" | "vertical_bar" | "area" | "radar" | "radial_bar"
type ChartDatum = { name: string; value: number }
type ChartSpec = {
  id: string
  title: string
  description: string
  reason?: string
  columnKey?: string
  variant: ChartVariant
  data: ChartDatum[]
  layout: "wide" | "medium" | "compact"
}
type RankedChartSpec = ChartSpec & { rank: number }
type SuggestedChart = {
  id: string
  title: string
  chart_type: ChartVariant
  x_axis: string
  layout: ChartSpec["layout"]
  reason?: string
}

type ChartVariantsProps = {
  allRows: SavedRow[]
  template: Template
  useAiSuggestions?: boolean
}

const pieColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

function buildColumnData(rows: SavedRow[], columnKey: string, limit = 8) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const label = String(row.cleaned_data[columnKey] ?? "").trim()
    if (!label) continue
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

function parseDataDate(value: unknown) {
  const raw = String(value ?? "").trim()
  if (!raw) return null

  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    return Number.isFinite(date.getTime()) ? date : null
  }

  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (slash) {
    const first = Number(slash[1])
    const second = Number(slash[2])
    const year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3])
    const day = first > 12 ? first : second > 12 ? second : first
    const month = first > 12 ? second : second > 12 ? first : second
    const date = new Date(year, month - 1, day)
    return Number.isFinite(date.getTime()) ? date : null
  }

  const timestamp = Date.parse(raw)
  if (!Number.isFinite(timestamp)) return null
  return new Date(timestamp)
}

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function buildDateColumnData(rows: SavedRow[], columnKey: string, limit = 12) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const date = parseDataDate(row.cleaned_data[columnKey])
    if (!date) continue
    const key = localDateKey(date)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, limit)
    .map(([name, value]) => ({
      name: new Date(`${name}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      value,
    }))
}

function buildAllColumnData(rows: SavedRow[], columnKey: string) {
  return buildColumnData(rows, columnKey, Number.POSITIVE_INFINITY)
}

function getRowDate(row: SavedRow, columnKey?: string) {
  if (columnKey) {
    const parsed = parseDataDate(row.cleaned_data[columnKey])
    if (parsed) return parsed
  }
  return new Date(row.created_at)
}

function buildTrendData(rows: SavedRow[], columnKey?: string) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const date = getRowDate(row, columnKey)
    if (!Number.isFinite(date.getTime())) continue
    const key = localDateKey(date)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => ({
      name: new Date(`${name}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      value,
    }))
}

function buildAiChangeData(rows: SavedRow[]) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    for (const change of row.ai_changes) {
      counts.set(change.field, (counts.get(change.field) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
}

function buildColumnProfiles(rows: SavedRow[], template: Template) {
  return template.columns_config.map((column) => ({
    key: column.key,
    label: column.label,
    kind: profileKind(rows, column.key),
    unique_count: buildAllColumnData(rows, column.key).length,
    filled_count: rows.filter((row) => String(row.cleaned_data[column.key] ?? "").trim()).length,
    top_values: buildColumnData(rows, column.key, 5),
  }))
}

function profileKind(rows: SavedRow[], columnKey: string) {
  const values = rows
    .map((row) => row.cleaned_data[columnKey])
    .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
    .map((v) => String(v).trim())
  const numCount = values.filter((v) => Number.isFinite(Number(v.replace(/,/g, "")))).length
  const dateCount = values.filter((v) => parseDataDate(v)).length
  if (dateCount >= Math.max(2, Math.ceil(values.length * 0.6))) return "time"
  if (numCount >= Math.max(2, Math.ceil(values.length * 0.6))) return "measure"
  return "dimension"
}

function pickPrimaryDateColumn(rows: SavedRow[], template: Template) {
  let best: { key: string; score: number; count: number } | null = null
  for (const column of template.columns_config) {
    const data = buildDateColumnData(rows, column.key, Number.POSITIVE_INFINITY)
    if (data.length < 1) continue
    const filled = rows.filter((row) => parseDataDate(row.cleaned_data[column.key])).length
    const nameScore = /date|time|created|visit|follow/i.test(`${column.key} ${column.label}`) ? 100 : 0
    const score = nameScore + data.length * 5 + filled
    if (!best || score > best.score) best = { key: column.key, score, count: data.length }
  }
  return best?.key
}

function shouldChartColumn(column: TemplateColumn, data: ChartDatum[]) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  if (data.length < 2 || total === 0) return false
  if (total > 0 && data.length / total > 0.65 && data.length > 8) return false
  return true
}

function layoutForData(data: ChartDatum[]): ChartSpec["layout"] {
  if (data.length >= 7) return "wide"
  if (data.length >= 4) return "medium"
  return "compact"
}

function rankColumn(column: TemplateColumn) {
  return column.required ? 0 : 1
}

function variantForColumn(rows: SavedRow[], column: TemplateColumn): ChartSpec["variant"] {
  const kind = profileKind(rows, column.key)
  const data = buildColumnData(rows, column.key)
  if (kind === "time") return "line"
  if (kind === "measure") return "bar"
  if (data.length <= 4) return "pie"
  if (data.length <= 6) return "radar"
  return "horizontal_bar"
}

function diversifyVariants(specs: ChartSpec[]): ChartSpec[] {
  const variantPool: ChartVariant[] = ["horizontal_bar", "pie", "area", "bar", "radar", "radial_bar", "line"]
  const usedVariants = new Set<ChartVariant>()
  const result = specs.map((spec) => {
    if (!usedVariants.has(spec.variant)) {
      usedVariants.add(spec.variant)
      return spec
    }
    const alt = variantPool.find((v) => !usedVariants.has(v) && v !== "line")
    if (alt) {
      usedVariants.add(alt)
      return { ...spec, variant: alt, reason: reasonForVariantSwap(spec, alt) }
    }
    usedVariants.add(spec.variant)
    return spec
  })
  return result
}

function reasonForVariantSwap(spec: ChartSpec, newVariant: ChartVariant) {
  const names: Record<string, string> = { radar: "radar", radial_bar: "radial bar", area: "area", pie: "donut", horizontal_bar: "horizontal bar", bar: "bar" }
  return `Switched to ${names[newVariant] ?? newVariant} chart for visual variety — ${spec.data.length} groups.`
}

function buildDynamicSpecs(rows: SavedRow[], template: Template, primaryDateColumn?: string): ChartSpec[] {
  const specs: ChartSpec[] = template.columns_config
    .filter((column) => column.key !== primaryDateColumn)
    .map<RankedChartSpec>((column) => {
      const variant = variantForColumn(rows, column)
      const data = variant === "line" ? buildDateColumnData(rows, column.key) : buildColumnData(rows, column.key)
      return {
        id: column.key,
        title: `${column.label} breakdown`,
        description: `${data.length} groups`,
        columnKey: column.key,
        variant,
        data,
        layout: layoutForData(data),
        reason: reasonForColumn(column, variant, data),
        rank: rankColumn(column),
      }
    })
    .filter((spec) => {
      const column = template.columns_config.find((item) => item.key === spec.id)
      return column ? shouldChartColumn(column, spec.data) : false
    })
    .sort((a, b) => a.rank - b.rank || b.data.length - a.data.length)
    .slice(0, 6)
    .map((spec) => ({
      id: spec.id,
      title: spec.title,
      description: spec.description,
      reason: spec.reason,
      columnKey: spec.columnKey,
      variant: spec.variant,
      data: spec.data,
      layout: spec.layout,
    }))

  const diversified = diversifyVariants(specs)

  const aiData = buildAiChangeData(rows)
  if (aiData.length > 0) {
    const usedVariants = new Set(diversified.map((s) => s.variant))
    const aiVariant: ChartVariant = !usedVariants.has("radial_bar") ? "radial_bar" : !usedVariants.has("bar") ? "bar" : "bar"
    diversified.push({
      id: "ai_changes",
      title: "AI changes by field",
      description: "Fields edited during cleaning",
      reason: "Highlights which fields needed the most AI cleanup, so review effort is easier to spot.",
      variant: aiVariant,
      data: aiData,
      layout: diversified.length < 2 ? "wide" : "medium",
    })
  }
  return diversified
}

function specsFromSuggestions(rows: SavedRow[], charts: SuggestedChart[], primaryDateColumn?: string): ChartSpec[] {
  const specs: ChartSpec[] = []
  for (const chart of charts) {
    const colKey = chart.x_axis || chart.id
    if (primaryDateColumn && colKey.toLowerCase().trim() === primaryDateColumn.toLowerCase().trim()) {
      continue
    }
    const variant = (["line", "area", "bar", "pie", "horizontal_bar", "vertical_bar", "radar", "radial_bar"].includes(chart.chart_type) ? chart.chart_type : null) as ChartSpec["variant"] | null
    const data = variant === "line" || variant === "area" ? buildDateColumnData(rows, colKey) : buildColumnData(rows, colKey)
    if (!variant || data.length < 2) continue
    specs.push({
      id: chart.id,
      title: chart.title,
      description: `${data.length} groups`,
      reason: chart.reason,
      columnKey: colKey,
      variant,
      data,
      layout: chart.layout,
    })
  }
  return specs
}

export function ChartVariants({
  allRows,
  template,
  useAiSuggestions = true,
}: ChartVariantsProps) {
  const datasetKey = `${template.id}:${useAiSuggestions ? "ai" : "default"}:${allRows[0]?.import_id ?? "none"}:${allRows.length}`

  return (
    <ChartVariantsWorkspace
      key={datasetKey}
      allRows={allRows}
      template={template}
      useAiSuggestions={useAiSuggestions}
    />
  )
}

function ChartVariantsWorkspace({
  allRows,
  template,
  useAiSuggestions = true,
}: ChartVariantsProps) {
  const [suggestedSpecs, setSuggestedSpecs] = useState<ChartSpec[] | null>(null)
  const [aiState, setAiState] = useState<"idle" | "loading" | "ready" | "fallback">(
    useAiSuggestions ? (allRows.length > 0 ? "loading" : "fallback") : "idle",
  )
  const [manualSpecs, setManualSpecs] = useState<ChartSpec[]>([])
  const [editedSpecs, setEditedSpecs] = useState<ChartSpec[] | null>(null)
  const [activeChartId, setActiveChartId] = useState<string | null>(null)
  const [selectedColumn, setSelectedColumn] = useState(template.columns_config[0]?.key ?? "")
  const [selectedChart, setSelectedChart] = useState<ChartSpec["variant"]>("horizontal_bar")
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const primaryDateColumn = useMemo(() => pickPrimaryDateColumn(allRows, template), [allRows, template])
  const primaryDateLabel = template.columns_config.find((column) => column.key === primaryDateColumn)?.label ?? "saved date"

  const filteredRows = useMemo(() => {
    if (!dateRange?.from) return allRows
    const from = new Date(dateRange.from); from.setHours(0, 0, 0, 0)
    const to = dateRange.to ? new Date(dateRange.to) : new Date(); to.setHours(23, 59, 59, 999)
    return allRows.filter((row) => {
      const date = getRowDate(row, primaryDateColumn)
      return date >= from && date <= to
    })
  }, [allRows, dateRange, primaryDateColumn])

  const trendData = useMemo(() => buildTrendData(filteredRows, primaryDateColumn), [filteredRows, primaryDateColumn])
  const fallbackSpecs = useMemo(() => buildDynamicSpecs(filteredRows, template, primaryDateColumn), [filteredRows, template, primaryDateColumn])
  const waitingForAi = useAiSuggestions && aiState === "loading" && suggestedSpecs === null
  const baseSpecs = useAiSuggestions
    ? suggestedSpecs?.length
      ? suggestedSpecs
      : waitingForAi
        ? []
      : fallbackSpecs
    : fallbackSpecs
  const chartSpecs = editedSpecs ?? [...baseSpecs, ...manualSpecs]
  const activeChart = chartSpecs.find((s) => s.id === activeChartId) ?? chartSpecs[0] ?? null

  useEffect(() => {
    if (!useAiSuggestions) {
      return
    }
    const importId = filteredRows[0]?.import_id
    if (!importId || filteredRows.length === 0) {
      return
    }
    const ctrl = new AbortController()
    void (async () => {
      try {
        const res = await api("/analytics/suggest-chart", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
          body: JSON.stringify({ import_id: importId, columns: template.columns_config.map((c) => c.key), template_columns: template.columns_config, column_profiles: buildColumnProfiles(filteredRows, template), sample_rows: filteredRows.slice(0, 40).map((r) => r.cleaned_data), filters: {} }),
        })
        const payload = (await res.json()) as { charts?: SuggestedChart[] }
        const next = specsFromSuggestions(filteredRows, payload.charts ?? [], primaryDateColumn)
        setSuggestedSpecs(next.length ? next : null)
        setAiState(next.length ? "ready" : "fallback")
      } catch {
        if (!ctrl.signal.aborted) {
          setSuggestedSpecs(null)
          setAiState("fallback")
        }
      }
    })()
    return () => ctrl.abort()
  }, [filteredRows, template, useAiSuggestions, primaryDateColumn])

  function addManualChart() {
    const column = template.columns_config.find((c) => c.key === selectedColumn)
    if (!column) return
    const data = selectedChart === "line" || selectedChart === "area" ? buildDateColumnData(filteredRows, column.key) : buildColumnData(filteredRows, column.key)
    if (data.length < 2) return
    setManualSpecs((cur) => [...cur, { id: `manual_${column.key}_${cur.length}`, title: `${column.label} breakdown`, description: `${data.length} groups`, reason: reasonForColumn(column, selectedChart, data), columnKey: column.key, variant: selectedChart, data, layout: layoutForData(data) }])
    setEditedSpecs(null)
  }

  function updateActiveChart(next: Partial<Pick<ChartSpec, "columnKey" | "layout" | "variant">>) {
    if (!activeChart) return
    setEditedSpecs((cur) => (cur ?? chartSpecs).map((s) => {
      if (s.id !== activeChart.id) return s
      const key = next.columnKey ?? s.columnKey
      const col = template.columns_config.find((c) => c.key === key)
      const variant = next.variant ?? s.variant
      const data = col ? (variant === "line" || variant === "area" ? buildDateColumnData(filteredRows, col.key) : buildColumnData(filteredRows, col.key)) : s.data
      return {
        ...s,
        ...next,
        title: col && next.columnKey ? `${col.label} breakdown` : s.title,
        description: col && next.columnKey ? `${data.length} groups` : s.description,
        reason: col ? reasonForColumn(col, variant, data) : s.reason,
        data,
        layout: next.columnKey ? layoutForData(data) : s.layout,
      }
    }))
  }

  function deleteActiveChart() {
    if (!activeChart) return
    setEditedSpecs((cur) => (cur ?? chartSpecs).filter((s) => s.id !== activeChart.id))
    setActiveChartId(null)
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <DatePickerWithRange value={dateRange} onChange={setDateRange} />
          <span className="text-sm text-muted-foreground">{filteredRows.length} rows</span>
          {useAiSuggestions ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs text-muted-foreground">
              {aiState === "loading" ? <Loader2Icon className="size-3 animate-spin" /> : <SparklesIcon className="size-3" />}
              {aiState === "loading" ? "AI reasoning" : aiState === "ready" ? "AI layout" : "Default layout"}
            </span>
          ) : null}
        </div>
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
            <MenuIcon className="size-4" />Charts
          </SheetTrigger>
          <SheetContent side="right" className="w-[320px] sm:max-w-[320px] flex flex-col gap-4">
            <SheetHeader><SheetTitle>Chart Builder</SheetTitle></SheetHeader>
            <div className="flex-1 overflow-auto space-y-3 p-4">
              {chartSpecs.map((spec) => (
                <button
                  key={spec.id}
                  type="button"
                  onClick={() => { setActiveChartId(spec.id); setDrawerOpen(false) }}
                  className={cn("w-full rounded-md border px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted/50", activeChart?.id === spec.id && "border-primary/50 bg-primary/10 text-primary")}
                >
                  <span className="block truncate font-medium">{spec.title}</span>
                  <span className="text-muted-foreground">{spec.variant.replace(/_/g, " ")} · {spec.layout} · {spec.data.length} groups</span>
                </button>
              ))}
              {activeChart ? (
                <div className="grid gap-2 border-t pt-3">
                  <Select value={activeChart.columnKey ?? ""} onValueChange={(v) => v && updateActiveChart({ columnKey: v })}>
                    <SelectTrigger size="sm"><SelectValue placeholder="Data column" /></SelectTrigger>
                    <SelectContent>{template.columns_config.map((c) => (<SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>))}</SelectContent>
                  </Select>
                  <Select value={activeChart.variant} onValueChange={(v) => v && updateActiveChart({ variant: v as ChartSpec["variant"] })}>
                    <SelectTrigger size="sm"><SelectValue placeholder="Chart type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="horizontal_bar">Horizontal bar</SelectItem>
                      <SelectItem value="line">Line</SelectItem>
                      <SelectItem value="area">Area</SelectItem>
                      <SelectItem value="bar">Bar</SelectItem>
                      <SelectItem value="vertical_bar">Vertical bar</SelectItem>
                      <SelectItem value="pie">Donut</SelectItem>
                      <SelectItem value="radar">Radar</SelectItem>
                      <SelectItem value="radial_bar">Radial bar</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={activeChart.layout} onValueChange={(v) => v && updateActiveChart({ layout: v as ChartSpec["layout"] })}>
                    <SelectTrigger size="sm"><SelectValue placeholder="Size" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wide">Wide</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="compact">Compact</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="destructive" onClick={deleteActiveChart}><TrashIcon />Remove chart</Button>
                </div>
              ) : null}
              <div className="grid gap-2 border-t pt-3">
                <p className="text-xs font-medium text-foreground">Add chart</p>
                <Select value={selectedColumn} onValueChange={(v) => v && setSelectedColumn(v)}>
                  <SelectTrigger size="sm"><SelectValue placeholder="Column" /></SelectTrigger>
                  <SelectContent>{template.columns_config.map((c) => (<SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>))}</SelectContent>
                </Select>
                <Select value={selectedChart} onValueChange={(v) => v && setSelectedChart(v as ChartSpec["variant"])}>
                  <SelectTrigger size="sm"><SelectValue placeholder="Chart" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="horizontal_bar">Horizontal bar</SelectItem>
                    <SelectItem value="line">Line</SelectItem>
                    <SelectItem value="area">Area</SelectItem>
                    <SelectItem value="bar">Bar</SelectItem>
                    <SelectItem value="vertical_bar">Vertical bar</SelectItem>
                    <SelectItem value="pie">Donut</SelectItem>
                    <SelectItem value="radar">Radar</SelectItem>
                    <SelectItem value="radial_bar">Radial bar</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={addManualChart}><PlusIcon />Add chart</Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="grid grid-flow-row-dense auto-rows-min items-start gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="md:col-span-2 xl:col-span-4">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><CardTitle className="text-base font-medium">Leads by date</CardTitle><p className="text-xs text-muted-foreground">Lead count grouped from {primaryDateLabel}</p></div>
              <span className="text-xs text-muted-foreground">{trendData.length} points</span>
            </div>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="aspect-auto h-[300px]">
              {renderChartVariant("line", trendData)}
            </ChartContainer>
          </CardContent>
        </Card>

        {waitingForAi ? <ChartReasoningSkeleton /> : null}

        {chartSpecs.map((spec) => (
          <Card key={spec.id} className={cn("self-start overflow-hidden", chartCardClassName(spec.layout))}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="truncate text-base font-medium">{spec.title}</CardTitle>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{spec.reason ?? spec.description}</p>
                </div>
                <span className="text-xs text-muted-foreground">{spec.data.length}</span>
              </div>
            </CardHeader>
            <CardContent>
              {spec.variant === "pie" ? (
                <PieDonutChart data={spec.data} compact={spec.layout === "compact"} />
              ) : spec.variant === "radial_bar" ? (
                <RadialBarChartBlock data={spec.data} compact={spec.layout === "compact"} />
              ) : (
                <ChartContainer config={chartConfig} className={chartHeightClassName(spec.layout)}>
                  {renderChartVariant(spec.variant, spec.data)}
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function reasonForColumn(column: TemplateColumn, variant: ChartSpec["variant"], data: ChartDatum[]) {
  if (variant === "line") return `${column.label} looks date-like, so a trend chart makes row movement easier to read.`
  if (variant === "area") return `${column.label} looks date-like, so an area chart shows both trend direction and lead volume.`
  if (variant === "pie") return `${column.label} has a small set of groups, which makes the split clear at a glance.`
  if (variant === "radar") return `${column.label} has ${data.length} groups — a radar chart highlights the balance across categories.`
  if (variant === "radial_bar") return `${column.label} has ${data.length} groups, shown as radial bars for quick magnitude comparison.`
  if (variant === "horizontal_bar") return `${column.label} has ${data.length} groups, so horizontal bars keep labels readable.`
  return `${column.label} is useful for comparing row counts across ${data.length} groups.`
}

function ChartReasoningSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className={index === 0 ? "md:col-span-2 xl:col-span-2" : undefined}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="grid flex-1 gap-2">
                <div className="h-4 w-36 animate-pulse rounded bg-muted" />
                <div className="h-3 w-full max-w-64 animate-pulse rounded bg-muted" />
              </div>
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className={index === 0 ? "h-[300px] animate-pulse rounded-lg bg-muted" : "h-[220px] animate-pulse rounded-lg bg-muted"} />
          </CardContent>
        </Card>
      ))}
    </>
  )
}

function chartCardClassName(layout: ChartSpec["layout"]) {
  if (layout === "wide") return "md:col-span-2 xl:col-span-2"
  if (layout === "medium") return "md:col-span-1 xl:col-span-2"
  return undefined
}

function chartHeightClassName(layout: ChartSpec["layout"]) {
  if (layout === "wide") return "aspect-auto h-[300px]"
  if (layout === "medium") return "aspect-auto h-[220px]"
  return "aspect-auto h-[170px]"
}

function PieDonutChart({ data, compact = false }: { data: ChartDatum[]; compact?: boolean }) {
  const visibleData = data.slice(0, 6)
  const total = visibleData.reduce((s, i) => s + i.value, 0)
  return (
    <div className="grid gap-3">
      <div className={compact ? "relative mx-auto h-[150px] w-full max-w-[260px]" : "relative mx-auto h-[190px] w-full max-w-[340px]"}>
        <ChartContainer config={chartConfig} className="aspect-auto h-full">
          <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <ChartTooltip content={<ChartTooltipContent />} />
            <Pie data={visibleData} dataKey="value" nameKey="name" innerRadius={compact ? 38 : 52} outerRadius={compact ? 60 : 78} paddingAngle={2} strokeWidth={0}>
              {visibleData.map((item, i) => (<Cell key={item.name} fill={pieColors[i % pieColors.length]} />))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div><div className="text-xl font-semibold tabular-nums">{total}</div><div className="text-[11px] text-muted-foreground">Rows</div></div>
        </div>
      </div>
      <div className={compact ? "grid gap-y-2 text-xs" : "grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3"}>
        {visibleData.map((item, i) => (
          <div key={item.name} className="flex min-w-0 items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: pieColors[i % pieColors.length] }} />
            <span className="truncate text-muted-foreground">{item.name}</span>
            <span className="ml-auto font-medium tabular-nums">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RadialBarChartBlock({ data, compact = false }: { data: ChartDatum[]; compact?: boolean }) {
  const visibleData = data.slice(0, 6)
  const radialData = visibleData.map((item, i) => ({ ...item, fill: pieColors[i % pieColors.length] }))
  const total = visibleData.reduce((s, i) => s + i.value, 0)
  return (
    <div className="grid gap-3">
      <div className={compact ? "relative mx-auto h-[150px] w-full max-w-[260px]" : "relative mx-auto h-[190px] w-full max-w-[340px]"}>
        <ChartContainer config={chartConfig} className="aspect-auto h-full">
          <RadialBarChart data={radialData} innerRadius={compact ? 24 : 30} outerRadius={compact ? 60 : 78} startAngle={180} endAngle={0}>
            <ChartTooltip content={<ChartTooltipContent />} />
            <RadialBar dataKey="value" background cornerRadius={4} />
          </RadialBarChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div><div className="text-xl font-semibold tabular-nums">{total}</div><div className="text-[11px] text-muted-foreground">Total</div></div>
        </div>
      </div>
      <div className={compact ? "grid gap-y-2 text-xs" : "grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3"}>
        {visibleData.map((item, i) => (
          <div key={item.name} className="flex min-w-0 items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: pieColors[i % pieColors.length] }} />
            <span className="truncate text-muted-foreground">{item.name}</span>
            <span className="ml-auto font-medium tabular-nums">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function renderChartVariant(type: ChartVariant, data: ChartDatum[]) {
  if (type === "pie") {
    return (
      <PieChart><ChartTooltip content={<ChartTooltipContent />} /><Pie data={data} dataKey="value" nameKey="name" outerRadius={80} innerRadius={45} label>{data.map((item, i) => (<Cell key={item.name} fill={pieColors[i % pieColors.length]} />))}</Pie></PieChart>
    )
  }
  if (type === "radar") {
    return (
      <RadarChart data={data} outerRadius="70%">
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
        <PolarRadiusAxis tick={{ fontSize: 10 }} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Radar dataKey="value" fill="var(--color-value)" fillOpacity={0.4} stroke="var(--color-value)" strokeWidth={2} />
      </RadarChart>
    )
  }
  if (type === "radial_bar") {
    const radialData = data.slice(0, 6).map((item, i) => ({ ...item, fill: pieColors[i % pieColors.length] }))
    return (
      <RadialBarChart data={radialData} innerRadius={30} outerRadius={80} startAngle={180} endAngle={0}>
        <ChartTooltip content={<ChartTooltipContent />} />
        <RadialBar dataKey="value" background cornerRadius={4} />
      </RadialBarChart>
    )
  }
  if (type === "line") {
    return (
      <LineChart data={data} margin={{ top: 8, right: 14, bottom: 6, left: 4 }}><CartesianGrid vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} minTickGap={18} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={34} /><ChartTooltip content={<ChartTooltipContent />} /><Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={{ r: 3 }} /></LineChart>
    )
  }
  if (type === "area") {
    return (
      <AreaChart data={data} margin={{ top: 8, right: 14, bottom: 6, left: 4 }}><CartesianGrid vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} minTickGap={18} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={34} /><ChartTooltip content={<ChartTooltipContent />} /><Area type="monotone" dataKey="value" fill="var(--color-value)" stroke="var(--color-value)" /></AreaChart>
    )
  }
  if (type === "horizontal_bar") {
    return (
      <BarChart data={data} layout="vertical" margin={{ top: 6, right: 14, bottom: 4, left: 8 }}><CartesianGrid horizontal={false} /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={92} interval={0} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="value" fill="var(--color-value)" radius={4} barSize={18} /></BarChart>
    )
  }
  return (
    <BarChart data={data} margin={{ top: 8, right: 14, bottom: 6, left: 4 }}><CartesianGrid vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} minTickGap={12} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={34} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="value" fill="var(--color-value)" radius={4} barSize={34} /></BarChart>
  )
}
