"use client"

import { useMemo, useRef, useState } from "react"
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
import { DownloadIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import {
  ChartCustomizerSidebar,
  type ChartCustomizerState,
} from "@/components/chart-customizer-sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { SavedRow } from "@/lib/types"

const colors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

export function ChartBuilder({ rows }: { rows: SavedRow[] }) {
  const chartRef = useRef<HTMLDivElement>(null)
  const columns = Object.keys(rows[0]?.cleaned_data ?? {})
  const [state, setState] = useState<ChartCustomizerState>({
    title: "Saved rows by source",
    chartType: columns.some((column) => column.includes("date")) ? "line" : "bar",
    xAxis: columns[0] ?? "source",
    yAxis: "count",
    groupBy: "none",
  })
  const data = useMemo(() => buildChartData(rows, state.xAxis), [rows, state.xAxis])

  async function suggestChart() {
    const response = await fetch("/api/analytics/suggest-chart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ import_id: rows[0]?.import_id ?? "imp_demo", columns, filters: {} }),
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
        xAxis: payload.suggestion.x_axis,
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
    anchor.download = `${state.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "chart"}.png`
    anchor.href = url
    anchor.click()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card ref={chartRef} className="min-h-[440px]">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <CardTitle>{state.title}</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void suggestChart()}>
              <SparklesIcon />
              Suggest
            </Button>
            <Button size="sm" onClick={() => void exportScreenshot()}>
              <DownloadIcon />
              PNG
            </Button>
          </div>
        </CardHeader>
        <CardContent className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            {renderChart(state.chartType, data)}
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <ChartCustomizerSidebar columns={columns} value={state} onChange={setState} />
    </div>
  )
}

function buildChartData(rows: SavedRow[], xAxis: string) {
  const counts = new Map<string, number>()

  for (const row of rows) {
    const label = String(row.cleaned_data[xAxis] ?? "Blank").trim() || "Blank"
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  return [...counts.entries()].map(([name, count]) => ({ name, count })).slice(0, 12)
}

function renderChart(type: ChartCustomizerState["chartType"], data: Array<{ name: string; count: number }>) {
  if (type === "pie") {
    return (
      <PieChart>
        <Tooltip />
        <Pie data={data} dataKey="count" nameKey="name" outerRadius={120} label>
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
        <Line type="monotone" dataKey="count" stroke="var(--chart-1)" strokeWidth={2} />
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
        <Area type="monotone" dataKey="count" fill="var(--chart-1)" stroke="var(--chart-1)" />
      </AreaChart>
    )
  }

  return (
    <BarChart data={data} layout={type === "horizontal_bar" ? "vertical" : "horizontal"}>
      <CartesianGrid vertical={false} />
      <XAxis dataKey={type === "horizontal_bar" ? "count" : "name"} type={type === "horizontal_bar" ? "number" : "category"} />
      <YAxis dataKey={type === "horizontal_bar" ? "name" : undefined} type={type === "horizontal_bar" ? "category" : "number"} allowDecimals={false} />
      <Tooltip />
      <Bar dataKey="count" fill="var(--chart-1)" radius={6} />
    </BarChart>
  )
}
