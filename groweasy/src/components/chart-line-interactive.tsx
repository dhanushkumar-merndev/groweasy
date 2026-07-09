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
import type { ImportJob, Template } from "@/lib/types"

type Props = {
  imports: ImportJob[]
  templates: Template[]
}

type ChartSeries = {
  key: string
  label: string
}

function formatDate(iso: string) {
  return iso.slice(0, 10)
}

function buildSeries(imports: ImportJob[], templates: Template[]): ChartSeries[] {
  return [
    ...new Set(
      imports.map((job) => templates.find((t) => t.id === job.template_id)?.name ?? "Unknown")
    ),
  ].map((label, index) => ({
    key: `template_${index}`,
    label,
  }))
}

function buildData(imports: ImportJob[], templates: Template[], series: ChartSeries[]) {
  const dateMap = new Map<string, Record<string, number>>()
  const seriesByLabel = new Map(series.map((item) => [item.label, item.key]))

  for (const job of imports) {
    const date = formatDate(job.created_at)
    const templateName = templates.find((t) => t.id === job.template_id)?.name ?? "Unknown"
    const seriesKey = seriesByLabel.get(templateName) ?? "template_0"
    if (!dateMap.has(date)) dateMap.set(date, {})
    const entry = dateMap.get(date)!
    entry[seriesKey] = (entry[seriesKey] ?? 0) + (job.final_saved_count || job.good_count)
  }

  return Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }))
}

function buildConfig(series: ChartSeries[]): ChartConfig {
  const greenSeries = [
    "var(--primary)",
    "hsl(151 55% 58%)",
    "hsl(166 64% 46%)",
    "hsl(142 58% 44%)",
    "hsl(178 56% 42%)",
  ]
  const config: ChartConfig = {}
  for (let i = 0; i < series.length; i++) {
    config[series[i].key] = {
      label: series[i].label,
      color: greenSeries[i % greenSeries.length],
    }
  }
  return config
}

export function ChartLineInteractive({ imports, templates }: Props) {
  const series = React.useMemo(
    () => buildSeries(imports, templates),
    [imports, templates]
  )

  const chartData = React.useMemo(() => buildData(imports, templates, series), [imports, templates, series])
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
    <Card className="py-4 sm:py-0">
      <CardHeader className="flex flex-col items-stretch border-b p-0! sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-3">
          <CardTitle>Leads Extracted</CardTitle>
          <CardDescription>
            Good rows saved per template over time
          </CardDescription>
        </div>
        <div className="flex flex-wrap">
          {series.map((item) => (
            <div
              key={item.key}
              className="flex flex-1 flex-col justify-center gap-1 border-t px-4 py-3 text-left sm:border-t-0 sm:border-l sm:px-6 sm:py-4"
            >
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <span className="text-lg leading-none font-bold sm:text-2xl">
                {(totals[item.key] ?? 0).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{ top: 18, left: 12, right: 12, bottom: 4 }}
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
                activeDot={{
                  r: 4,
                  fill: "var(--primary)",
                  stroke: "var(--background)",
                  strokeWidth: 2,
                }}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
