import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowRightIcon, BarChart3Icon, InboxIcon, Rows3Icon, SparklesIcon, Table2Icon } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { requireCurrentUser, serverFetch } from "@/lib/server-api"
import type { ImportJob, Template } from "@/lib/types"

export default async function AnalyticsPage() {
  await requireCurrentUser()

  const [{ imports }, { templates }] = await Promise.all([
    serverFetch<{ imports: ImportJob[] }>("/imports"),
    serverFetch<{ templates: Template[] }>("/templates"),
  ])

  const templateSummaries = templates.map((template) => {
    const templateImports = imports.filter((job) => job.template_id === template.id)
    const savedRows = templateImports.reduce((total, job) => total + (job.final_saved_count || job.good_count), 0)
    const lastUpdated = templateImports
      .map((job) => job.updated_at)
      .sort()
      .at(-1)

    return {
      template,
      imports: templateImports.length,
      savedRows,
      fields: template.columns_config.length,
      lastUpdated,
    }
  })

  return (
    <AppShell title="Analytics" description="Select a template to inspect and edit its saved rows.">
      {templateSummaries.length === 0 ? (
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
                      {summary.lastUpdated ? `Updated ${new Date(summary.lastUpdated).toLocaleDateString()}` : "No saved rows yet"}
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
      )}
    </AppShell>
  )
}

function TemplateMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode
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
