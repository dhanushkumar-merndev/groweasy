import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, InboxIcon } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { AnalyticsDetailSkeleton } from "@/components/skeletons/page-skeletons"
import { ChartVariants } from "@/components/chart-variants"
import { StatusCountCards } from "@/components/status-count-cards"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { serverFetch } from "@/lib/server-api"
import type { ImportJob, SavedRow, Template } from "@/lib/types"

const PAGE_DESCRIPTION = "Chart variants for saved rows across multiple chart types."

export default async function TemplateAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>
  searchParams: Promise<{ mode?: string }>
}) {
  const { templateId } = await params
  const { mode } = await searchParams
  const useAiSuggestions = mode !== "default"

  return (
    <AppShell title="Analytics" description={PAGE_DESCRIPTION}>
      <Suspense fallback={<AnalyticsDetailSkeleton />}>
        <TemplateAnalyticsContent templateId={templateId} useAiSuggestions={useAiSuggestions} />
      </Suspense>
    </AppShell>
  )
}

async function TemplateAnalyticsContent({
  templateId,
  useAiSuggestions,
}: {
  templateId: string
  useAiSuggestions: boolean
}) {
  const [{ template }, { imports }] = await Promise.all([
    serverFetch<{ template: Template | null }>(`/templates/${templateId}`),
    serverFetch<{ imports: ImportJob[] }>("/imports"),
  ])

  if (!template) notFound()

  const savedTemplateImports = imports.filter(
    (job) => job.template_id === template.id && job.status === "saved",
  )
  const rows = await loadSavedRows(savedTemplateImports)
  const summary = buildSummary(rows)
  const hasRows = rows.length > 0

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit text-muted-foreground hover:text-foreground"
          render={<Link href="/analytics" />}
        >
          <ArrowLeftIcon className="size-4" />
          Templates
        </Button>
      </div>

      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">{template.name}</h2>
        <p className="text-sm text-muted-foreground">{PAGE_DESCRIPTION}</p>
      </div>

      <StatusCountCards summary={summary} />

      {hasRows ? (
        <ChartVariants allRows={rows} template={template} useAiSuggestions={useAiSuggestions} />
      ) : (
        <EmptyAnalyticsState templateName={template.name} />
      )}
    </div>
  )
}

async function loadSavedRows(imports: ImportJob[]) {
  if (imports.length === 0) return []

  const rowGroups = await Promise.all(
    imports.map(async (job) => {
      try {
        const data = await serverFetch<{ rows: SavedRow[] }>(`/tables/${job.id}/rows?offset=0&limit=1000`)
        return data.rows
      } catch {
        return []
      }
    }),
  )

  return rowGroups.flat()
}

function buildSummary(rows: SavedRow[]) {
  return {
    good_count: rows.length,
    missing_count: 0,
    skipped_count: 0,
    ai_changed_count: rows.reduce((total, row) => total + row.ai_changes.length, 0),
  }
}

function EmptyAnalyticsState({ templateName }: { templateName: string }) {
  return (
    <Card>
      <CardContent className="flex min-h-80 flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
        <InboxIcon className="size-10" />
        <div className="grid gap-1">
          <p className="font-medium text-foreground">No saved rows for this template</p>
          <p className="text-sm">Save cleaned rows from an import that uses {templateName} to see them here.</p>
        </div>
      </CardContent>
    </Card>
  )
}
