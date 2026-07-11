"use client"

import * as React from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { ImportJob } from "@/lib/types"

type Props = {
  imports: ImportJob[]
  templates?: unknown[]
}

type ChartSeries = {
  key: string
  label: string
}

function formatDate(iso: string) {
  return iso.slice(0, 10)
}

function buildSeries(): ChartSeries[] {
  return [{ key: "leads", label: "Saved leads" }]
}

function buildData(imports: ImportJob[]) {
  const dateMap = new Map<string, Record<string, number>>()

  for (const job of imports) {
    if (job.status !== "saved") {
      continue
    }

    const date = formatDate(job.created_at)
    if (!dateMap.has(date)) dateMap.set(date, {})
    const entry = dateMap.get(date)!
    entry.leads = (entry.leads ?? 0) + job.final_saved_count
  }

  return Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => {
      const row: Record<string, string | number> = { date }
      row.leads = counts.leads ?? 0
      return row
    })
}

function buildConfig(series: ChartSeries[]): ChartConfig {
  const seriesColors = [
    "var(--primary)",
    "hsl(199 89% 55%)",
    "hsl(38 92% 55%)",
    "hsl(262 83% 66%)",
    "hsl(346 77% 58%)",
    "hsl(173 70% 44%)",
  ]
  const config: ChartConfig = {}
  for (let i = 0; i < series.length; i++) {
    config[series[i].key] = {
      label: series[i].label,
      color: seriesColors[i % seriesColors.length],
    }
  }
  return config
}

export function ChartLineInteractive({ imports }: Props) {
  const series = React.useMemo(() => buildSeries(), [])

  const chartData = React.useMemo(() => buildData(imports), [imports])
  const chartConfig = React.useMemo(() => buildConfig(series), [series])

  const totals = React.useMemo(() => {
    const t: Record<string, number> = {}
    for (const row of chartData) {
      for (const item of series) {
        t[item.key] = (t[item.key] ?? 0) + ((row as unknown as Record<string, number>)[item.key] ?? 0)
      }
    }
    return t
  }, [chartData, series])

  const totalLeads = React.useMemo(
    () => series.reduce((total, item) => total + (totals[item.key] ?? 0), 0),
    [series, totals],
  )

  const yMax = React.useMemo(() => {
    let max = 0
    for (const row of chartData) {
      for (const item of series) {
        max = Math.max(max, (row as unknown as Record<string, number>)[item.key] ?? 0)
      }
    }
    return Math.max(1, max)
  }, [chartData, series])

  return (
    <Card className="overflow-hidden py-0">
      <CardHeader className="flex flex-col items-stretch border-b p-0! sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-3">
          <CardTitle>Leads Extracted</CardTitle>
          <CardDescription>
            Saved leads over time
          </CardDescription>
        </div>
        <div className="flex min-w-[136px] flex-col justify-center gap-1 border-t px-4 py-3 text-left sm:border-t-0 sm:border-l sm:px-6 sm:py-4">
          <span className="text-xs text-muted-foreground">Total leads</span>
          <span className="text-lg leading-none font-bold sm:text-2xl">
            {totalLeads.toLocaleString()}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-2 py-4 sm:p-6">
        {series.length > 1 && (
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-2 text-xs text-muted-foreground sm:px-0">
            {series.map((item) => (
              <div key={item.key} className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: `var(--color-${item.key})` }}
                />
                <span className="max-w-[180px] truncate">{item.label}</span>
                <span className="tabular-nums text-foreground">{(totals[item.key] ?? 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
        {chartData.length === 0 ? (
          <div className="grid h-[250px] place-items-center rounded-md border border-dashed text-sm text-muted-foreground">
            Save cleaned rows to see lead trends.
          </div>
        ) : (
        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{ top: 16, left: 8, right: 16, bottom: 4 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value)
                return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
              }}
            />
            <YAxis
              hide
              allowDecimals={false}
              domain={[0, Math.ceil(yMax * 1.2)]}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--primary)", strokeOpacity: 0.35, strokeWidth: 1.5 }}
              content={
                <ChartTooltipContent
                  className="w-[180px]"
                  color="var(--primary)"
                  labelFormatter={(value) =>
                    new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  }
                />
              }
            />
            {series.map((item) => (
              <Line
                key={item.key}
                dataKey={item.key}
                type="monotone"
                stroke={`var(--color-${item.key})`}
                strokeWidth={2.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
                activeDot={{
                  r: 4,
                  fill: `var(--color-${item.key})`,
                  stroke: "var(--background)",
                  strokeWidth: 2,
                }}
              />
            ))}
          </LineChart>
        </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
