"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRightIcon, BarChart3Icon, InboxIcon, Rows3Icon, SparklesIcon, Table2Icon } from "lucide-react"
import { TemplateCardsSkeleton } from "@/components/skeletons/page-skeletons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache"
import { loadAnalyticsData, type AnalyticsData } from "@/lib/page-data"
import { useCachedResource } from "@/hooks/use-cached-resource"
import type { ImportJob, Template } from "@/lib/types"

const CACHE_KEY = CLIENT_CACHE_KEYS.analyticsList
const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
})

type TemplateSummary = {
  template: Template
  imports: number
  savedRows: number
  fields: number
  lastUpdated: string | null
}

function summarizeTemplates({ imports, templates }: AnalyticsData) {
  const uniqueTemplates = [...new Map(templates.map((template) => [template.id, template])).values()]

  // Group once so each card can be derived without repeatedly scanning the full import list.
  const importsByTemplate = new Map<string, ImportJob[]>()

  for (const job of imports) {
    const templateImports = importsByTemplate.get(job.template_id)

    if (templateImports) {
      templateImports.push(job)
      continue
    }

    importsByTemplate.set(job.template_id, [job])
  }

  return uniqueTemplates
    .map<TemplateSummary>((template) => {
      const templateImports = importsByTemplate.get(template.id) ?? []
      let savedRows = 0
      let lastUpdated: string | null = null

      // Saved imports are the only ones that contribute rows to analytics.
      for (const job of templateImports) {
        if (job.status !== "saved") continue

        savedRows += job.final_saved_count

        if (!lastUpdated || job.updated_at > lastUpdated) {
          lastUpdated = job.updated_at
        }
      }

      return {
        template,
        imports: templateImports.length,
        savedRows,
        fields: template.columns_config.length,
        lastUpdated,
      }
    })
    // Show the most useful analytics entry points first, then fall back to a stable name order.
    .sort((a, b) => {
      if (b.savedRows !== a.savedRows) return b.savedRows - a.savedRows
      if (a.lastUpdated && b.lastUpdated) return b.lastUpdated.localeCompare(a.lastUpdated)
      if (b.lastUpdated) return 1
      if (a.lastUpdated) return -1
      return a.template.name.localeCompare(b.template.name)
    })
}

export function AnalyticsClient() {
  const { data, error, loading } = useCachedResource({
    cacheKey: CACHE_KEY,
    load: loadAnalyticsData,
  })
  const templateSummaries = React.useMemo(
    () => (data ? summarizeTemplates(data) : []),
    [data],
  )

  if (loading && !data) return <TemplateCardsSkeleton />

  if (error && !data) {
    return (
      <Card>
        <CardContent className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">
          {error}
        </CardContent>
      </Card>
    )
  }

  return templateSummaries.length === 0 ? (
    <Card>
      <CardContent className="flex min-h-80 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <InboxIcon className="size-10" />
        <div>
          <p className="font-medium text-foreground">No templates available</p>
          <p className="text-sm">Create or restore a template before viewing analytics.</p>
        </div>
      </CardContent>
    </Card>
  ) : (
    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      {templateSummaries.map((summary) => (
        <Card key={summary.template.id} className="h-fit py-0">
          <div className="grid gap-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="grid gap-1">
                <CardTitle className="text-lg">{summary.template.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {summary.lastUpdated
                    ? `Updated ${DATE_FORMATTER.format(new Date(summary.lastUpdated))}`
                    : "No saved rows yet"}
                </p>
              </div>
              <Badge variant="outline">
                <BarChart3Icon className="size-3.5" />
                Template
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <TemplateMetric icon={<Rows3Icon />} label="Saved" value={summary.savedRows} />
              <TemplateMetric icon={<Table2Icon />} label="Imports" value={summary.imports} />
              <TemplateMetric icon={<BarChart3Icon />} label="Fields" value={summary.fields} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button render={<Link href={`/analytics/${summary.template.id}?mode=ai`} />}>
                <SparklesIcon />
                AI Generate
              </Button>
              <Button variant="outline" render={<Link href={`/analytics/${summary.template.id}?mode=default`} />}>
                Default
                <ArrowRightIcon />
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

function TemplateMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <div className="grid gap-1 rounded-lg border bg-muted/20 p-2">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <span className="[&_svg]:size-3">{icon}</span>
        {label}
      </div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  )
}
