"use client"

import { useMemo, useRef, useState, type ReactNode } from "react"
import { toPng } from "html-to-image"
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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { DownloadIcon, InboxIcon, Loader2Icon, Rows3Icon, SparklesIcon, Table2Icon } from "lucide-react"
import { toast } from "sonner"

import {
  ChartCustomizerSidebar,
  type ChartCustomizerState,
} from "@/components/chart-customizer-sidebar"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api-client"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ImportJob, SavedRow } from "@/lib/types"

const colors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

const allSheetsValue = "__all_sheets__"
const allImportsValue = "__all_imports__"

export function ChartBuilder({
  imports,
  initialImportId,
  initialRows,
}: {
  imports: ImportJob[]
  initialImportId?: string
  initialRows: SavedRow[]
}) {
  const chartRef = useRef<HTMLDivElement>(null)
  const initialColumns = getColumns(initialRows)
  const [selectedImportId, setSelectedImportId] = useState(initialImportId ?? allImportsValue)
  const [allRows, setAllRows] = useState(initialRows)
  const [rows, setRows] = useState(initialRows)
  const [isLoadingRows, setIsLoadingRows] = useState(false)
  const [selectedSheet, setSelectedSheet] = useState(allSheetsValue)
  const activeImport = imports.find((job) => job.id === selectedImportId)
  const columns = useMemo(() => getColumns(rows), [rows])
  const numericColumns = useMemo(() => columns.filter((column) => isNumericColumn(rows, column)), [columns, rows])
  const sheetNames = useMemo(() => [...new Set(rows.map((row) => row.sheet_name).filter(Boolean))], [rows])
  const filteredRows = useMemo(
    () => (selectedSheet === allSheetsValue ? rows : rows.filter((row) => row.sheet_name === selectedSheet)),
    [rows, selectedSheet],
  )
  const [state, setState] = useState<ChartCustomizerState>({
    title: initialColumns[0] ? `Saved rows by ${initialColumns[0]}` : "Saved rows by field",
    chartType: initialColumns.some((column) => isDateLikeColumn(column)) ? "line" : "bar",
    xAxis: initialColumns[0] ?? "",
    yAxis: "count",
    groupBy: "none",
  })
  const data = useMemo(() => buildChartData(filteredRows, state.xAxis || columns[0] || "", state.yAxis), [
    columns,
    filteredRows,
    state.xAxis,
    state.yAxis,
  ])
  const totalValue = data.reduce((sum, item) => sum + item.value, 0)
  const chartTitle = state.title.trim() || "Analytics chart"

  async function changeImport(importId: string) {
    setSelectedImportId(importId)
    setSelectedSheet(allSheetsValue)

    if (importId === allImportsValue) {
      setRows(allRows)
      return
    }

    setIsLoadingRows(true)

    try {
      const response = await api(`/tables/${importId}/rows?offset=0&limit=1000`)

      if (!response.ok) {
        throw new Error("Failed to load saved rows")
      }

      const payload = (await response.json()) as { rows: SavedRow[] }
      const nextRows = payload.rows
      const nextColumns = getColumns(nextRows)

      setRows(nextRows)
      setAllRows((current) => {
        const withoutImport = current.filter((row) => row.import_id !== importId)
        return [...withoutImport, ...nextRows]
      })
      setState((current) => ({
        ...current,
        title: nextRows.length ? `${imports.find((job) => job.id === importId)?.import_name ?? "Import"} overview` : current.title,
        chartType: nextColumns.some((column) => isDateLikeColumn(column)) ? "line" : "bar",
        xAxis: nextColumns[0] ?? "",
        yAxis: "count",
        groupBy: "none",
      }))
    } catch {
      toast.error("Could not load rows for that import.")
      setRows([])
    } finally {
      setIsLoadingRows(false)
    }
  }

  async function suggestChart() {
    const importId = selectedImportId === allImportsValue ? rows[0]?.import_id : selectedImportId || rows[0]?.import_id

    if (!importId) {
      toast.error("No saved rows available for chart suggestions.")
      return
    }

    const response = await api("/analytics/suggest-chart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        import_id: importId,
        columns,
        sample_rows: rows.slice(0, 8).map((row) => row.cleaned_data),
        filters: selectedSheet === allSheetsValue ? {} : { sheet: selectedSheet },
      }),
    })
    const payload = (await response.json()) as {
      suggestion?: {
        chart_type: ChartCustomizerState["chartType"]
        title: string
        x_axis: string
        y_axis: string
        group_by?: string
      }
    }

    if (payload.suggestion) {
      setState({
        title: payload.suggestion.title,
        chartType: payload.suggestion.chart_type,
        xAxis: payload.suggestion.x_axis || columns[0] || "",
        yAxis: payload.suggestion.y_axis,
        groupBy: payload.suggestion.group_by ?? "none",
      })
      toast.success("AI chart suggestion applied.")
    }
  }

  async function exportScreenshot() {
    if (!chartRef.current) {
      return
    }

    const url = await toPng(chartRef.current, { cacheBust: true, pixelRatio: 2 })
    const anchor = document.createElement("a")
    anchor.download = `${chartTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "chart"}.png`
    anchor.href = url
    anchor.click()
  }

  if (imports.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-80 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <InboxIcon className="size-10" />
          <div>
            <p className="font-medium text-foreground">No saved imports yet</p>
            <p className="text-sm">Upload, clean, and save rows before opening analytics.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(220px,0.7fr)] lg:grid-cols-[minmax(0,1fr)_260px_260px]">
        <div className="grid gap-2">
          <label className="text-sm font-medium">Import</label>
          <Select value={selectedImportId} onValueChange={(value) => value && void changeImport(value)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allImportsValue}>All imports</SelectItem>
              {imports.map((job) => (
                <SelectItem key={job.id} value={job.id}>
                  {job.import_name || job.file_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium">Sheet</label>
          <Select value={selectedSheet} onValueChange={(value) => value && setSelectedSheet(value)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allSheetsValue}>All sheets</SelectItem>
              {sheetNames.map((sheetName) => (
                <SelectItem key={sheetName} value={sheetName}>
                  {sheetName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatTile icon={<Rows3Icon />} label="Rows" value={filteredRows.length} />
          <StatTile icon={<Table2Icon />} label="Fields" value={columns.length} />
          <StatTile icon={<SparklesIcon />} label="Value" value={formatNumber(totalValue)} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card ref={chartRef} className="min-h-[460px]">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>{chartTitle}</CardTitle>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">
                {selectedImportId === allImportsValue ? "All imports" : activeImport?.file_name ?? "Saved import"}
              </Badge>
              <span>{selectedSheet === allSheetsValue ? "All sheets" : selectedSheet}</span>
              <span>{state.yAxis === "count" ? "Counting rows" : `Summing ${state.yAxis}`}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void suggestChart()} disabled={isLoadingRows || columns.length === 0}>
              {isLoadingRows ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              Suggest
            </Button>
            <Button size="sm" onClick={() => void exportScreenshot()} disabled={data.length === 0}>
              <DownloadIcon />
              PNG
            </Button>
          </div>
        </CardHeader>
        <CardContent className="h-[360px]">
          {data.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
              {isLoadingRows ? "Loading saved rows..." : "No chartable saved rows for this selection."}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {renderChart(state.chartType, data)}
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      <ChartCustomizerSidebar columns={columns} numericColumns={numericColumns} value={state} onChange={setState} />
      </div>
    </div>
  )
}

function StatTile({ icon, label, value }: { icon: ReactNode; label: string; value: number | string }) {
  return (
    <div className="grid min-h-16 gap-1 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="[&_svg]:size-3.5">{icon}</span>
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function getColumns(rows: SavedRow[]) {
  return [...new Set(rows.flatMap((row) => Object.keys(row.cleaned_data)))]
}

function isDateLikeColumn(column: string) {
  const lower = column.toLowerCase()
  return lower.includes("date") || lower.includes("time") || lower.includes("created")
}

function isNumericColumn(rows: SavedRow[], column: string) {
  return rows.some((row) => {
    const value = row.cleaned_data[column]
    if (typeof value === "number") return Number.isFinite(value)
    if (typeof value !== "string" || value.trim() === "") return false
    return Number.isFinite(Number(value.replace(/,/g, "")))
  })
}

function numericValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function buildChartData(rows: SavedRow[], xAxis: string, yAxis: string) {
  const counts = new Map<string, number>()

  for (const row of rows) {
    const label = String(row.cleaned_data[xAxis] ?? row.sheet_name ?? "Blank").trim() || "Blank"
    const nextValue = yAxis === "count" ? 1 : numericValue(row.cleaned_data[yAxis])
    counts.set(label, (counts.get(label) ?? 0) + nextValue)
  }

  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value)
}

function renderChart(type: ChartCustomizerState["chartType"], data: Array<{ name: string; value: number }>) {
  if (type === "pie") {
    return (
      <PieChart>
        <Tooltip />
        <Pie data={data} dataKey="value" nameKey="name" outerRadius={120} label>
          {data.map((item, index) => (
            <Cell key={item.name} fill={colors[index % colors.length]} />
          ))}
        </Pie>
      </PieChart>
    )
  }

  if (type === "line") {
    return (
      <LineChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="name" />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Line type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2} />
      </LineChart>
    )
  }

  if (type === "area") {
    return (
      <AreaChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="name" />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Area type="monotone" dataKey="value" fill="var(--chart-1)" stroke="var(--chart-1)" />
      </AreaChart>
    )
  }

  return (
    <BarChart data={data} layout={type === "horizontal_bar" ? "vertical" : "horizontal"}>
      <CartesianGrid vertical={false} />
      <XAxis dataKey={type === "horizontal_bar" ? "value" : "name"} type={type === "horizontal_bar" ? "number" : "category"} />
      <YAxis dataKey={type === "horizontal_bar" ? "name" : undefined} type={type === "horizontal_bar" ? "category" : "number"} allowDecimals={false} />
      <Tooltip />
      <Bar dataKey="value" fill="var(--chart-1)" radius={6} />
    </BarChart>
  )
}
