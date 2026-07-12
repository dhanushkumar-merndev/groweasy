import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AlertTriangleIcon, ArrowLeftIcon, InboxIcon } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { AnalyticsDetailSkeleton } from "@/components/skeletons/page-skeletons"
import { ChartVariants } from "@/components/chart-variants"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { StatusCountCards } from "@/components/status-count-cards"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { serverFetch } from "@/lib/server-api"
import type { ImportJob, SavedRow, Template } from "@/lib/types"

const PAGE_DESCRIPTION = "Chart variants for saved rows across multiple chart types."
const MAX_ANALYTICS_ROWS = 3000
const MAX_ROWS_PER_IMPORT = 750

type SavedRowsResult = {
  rows: SavedRow[]
  failedImportCount: number
  truncatedImportCount: number
  requestedRowCount: number
}

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
  // Load the template and its import history together so the content can render in one pass.
  const [{ template }, { imports }] = await Promise.all([
    serverFetch<{ template: Template | null }>(`/templates/${templateId}`),
    serverFetch<{ imports: ImportJob[] }>("/imports"),
  ])

  if (!template) notFound()

  // Analytics only reflects rows that were actually saved into a cleaned table.
  const savedTemplateImports = imports.filter(
    (job) => job.template_id === template.id && job.status === "saved",
  )
  const rowResult = await loadSavedRows(savedTemplateImports)
  const rows = rowResult.rows
  const summary = buildSummary(savedTemplateImports)
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

      <AnalyticsDataAlert result={rowResult} totalSavedRows={summary.good_count} />

      {hasRows ? (
        <ChartVariants allRows={rows} template={template} useAiSuggestions={useAiSuggestions} />
      ) : (
        <EmptyAnalyticsState templateName={template.name} />
      )}
    </div>
  )
}

async function loadSavedRows(imports: ImportJob[]): Promise<SavedRowsResult> {
  if (imports.length === 0) {
    return {
      rows: [],
      failedImportCount: 0,
      truncatedImportCount: 0,
      requestedRowCount: 0,
    }
  }

  const orderedImports = [...imports].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )

  const rows: SavedRow[] = []
  let failedImportCount = 0
  let truncatedImportCount = 0
  let remainingRows = MAX_ANALYTICS_ROWS

  for (const job of orderedImports) {
    if (remainingRows <= 0) {
      truncatedImportCount += 1
      continue
    }

    const requestLimit = Math.min(remainingRows, MAX_ROWS_PER_IMPORT)

    try {
      const data = await serverFetch<{ rows: SavedRow[] }>(
        `/tables/${job.id}/rows?offset=0&limit=${requestLimit}`,
      )

      rows.push(...data.rows)
      remainingRows -= data.rows.length

      if (job.final_saved_count > data.rows.length) {
        truncatedImportCount += 1
      }
    } catch {
      // Keep the page usable even if one saved import can no longer be read.
      failedImportCount += 1
    }
  }

  return {
    rows,
    failedImportCount,
    truncatedImportCount,
    requestedRowCount: rows.length,
  }
}

function buildSummary(imports: ImportJob[]) {
  // Saved-row tables do not persist missing/skipped row detail, so the page
  // summary uses import summaries for counts and the chart data for breakdowns.
  return {
    good_count: imports.reduce((total, job) => total + job.final_saved_count, 0),
    missing_count: imports.reduce((total, job) => total + job.missing_count, 0),
    skipped_count: imports.reduce((total, job) => total + job.skipped_count, 0),
    ai_changed_count: imports.reduce((total, job) => total + job.ai_changed_count, 0),
  }
}

function AnalyticsDataAlert({
  result,
  totalSavedRows,
}: {
  result: SavedRowsResult
  totalSavedRows: number
}) {
  if (result.failedImportCount === 0 && result.truncatedImportCount === 0) {
    return null
  }

  return (
    <Alert>
      <AlertTriangleIcon className="size-4" />
      <AlertTitle>Showing a partial analytics dataset</AlertTitle>
      <AlertDescription>
        {result.failedImportCount > 0
          ? `${result.failedImportCount} saved import${result.failedImportCount > 1 ? "s" : ""} could not be loaded. `
          : ""}
        {result.truncatedImportCount > 0
          ? `Charts are limited to ${result.requestedRowCount.toLocaleString()} loaded row${result.requestedRowCount === 1 ? "" : "s"} out of ${totalSavedRows.toLocaleString()} saved row${totalSavedRows === 1 ? "" : "s"} to keep the page responsive.`
          : "Charts may be missing data from one or more saved imports."}
      </AlertDescription>
    </Alert>
  )
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
