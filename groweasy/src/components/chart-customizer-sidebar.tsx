"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import type { ChartType } from "@/lib/types"

export type ChartCustomizerState = {
  title: string
  chartType: ChartType
  xAxis: string
  yAxis: string
  groupBy: string
}

const chartTypes: Array<{ value: ChartType; label: string }> = [
  { value: "bar", label: "Bar" },
  { value: "horizontal_bar", label: "Horizontal bar" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
  { value: "pie", label: "Pie" },
  { value: "vertical_bar", label: "Vertical bar" },
]

export function ChartCustomizerSidebar({
  columns,
  value,
  onChange,
}: {
  columns: string[]
  value: ChartCustomizerState
  onChange: (value: ChartCustomizerState) => void
}) {
  return (
    <aside className="grid gap-4 rounded-lg border bg-card p-4 lg:sticky lg:top-20">
      <div className="grid gap-2">
        <label className="text-sm font-medium">Chart title</label>
        <Input value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} />
      </div>
      <Select
        value={value.chartType}
        onValueChange={(chartType) => {
          if (chartType) {
            onChange({ ...value, chartType: chartType as ChartType })
          }
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {chartTypes.map((type) => (
            <SelectItem key={type.value} value={type.value}>
              {type.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <AxisSelect label="X-axis" columns={columns} value={value.xAxis} onChange={(xAxis) => onChange({ ...value, xAxis })} />
      <AxisSelect label="Y-axis" columns={["count", ...columns]} value={value.yAxis} onChange={(yAxis) => onChange({ ...value, yAxis })} />
      <AxisSelect label="Group by" columns={["none", ...columns]} value={value.groupBy} onChange={(groupBy) => onChange({ ...value, groupBy })} />
    </aside>
  )
}

function AxisSelect({
  label,
  columns,
  value,
  onChange,
}: {
  label: string
  columns: string[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium">{label}</label>
      <Select value={value} onValueChange={(nextValue) => nextValue && onChange(nextValue)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {columns.map((column) => (
            <SelectItem key={column} value={column}>
              {column}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
