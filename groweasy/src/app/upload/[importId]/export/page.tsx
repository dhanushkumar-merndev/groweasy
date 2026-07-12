import { redirect } from "next/navigation"
import Link from "next/link"

import { AppShell } from "@/components/app-shell"
import { ImportStepLayout } from "@/components/import-step-layout"
import { ExportMenu } from "@/components/export-menu"
import { NewUploadButton } from "@/components/new-upload-button"
import { SaveReviewedRowsButton } from "@/components/save-reviewed-rows-button"
import { StatusCountCards } from "@/components/status-count-cards"
import { Button } from "@/components/ui/button"
import { ArrowLeftIcon } from "lucide-react"
import { serverFetch } from "@/lib/server-api"
import type { CleanedRow, ImportJob, Template } from "@/lib/types"

export default async function ExportPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params

  const importData = await serverFetch<{ import: ImportJob; template: Template | null; cleaned_rows: CleanedRow[] }>(
    `/imports/${importId}`
  )
  const { import: job, template } = importData

  if (!job || !template) redirect("/upload")

  const results = await serverFetch<{ rows: CleanedRow[] }>(`/imports/${importId}/results`)
  const rows = results.rows

  const goodRows   = rows.filter((r) => r.status === "good")
  const savedCount = job.final_saved_count ?? 0

  return (
    <AppShell title="Save / Export" description="Download or push your cleaned data.">
      <ImportStepLayout
        importId={importId}
        currentStep={5}
        importStatus={job.status}
      >
        <div className="grid min-w-0 gap-6">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              render={<Link href={`/upload/${importId}/review`} />}
            >
              <ArrowLeftIcon className="size-4" />
              Back
            </Button>
            <NewUploadButton needsWarning={savedCount === 0} />
          </div>

          <div className="min-w-0">
            <h2 className="truncate text-2xl font-semibold tracking-tight">Export</h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {job.file_name} - {goodRows.length} good rows ready to export.
              {savedCount > 0 ? ` ${savedCount} rows saved.` : " Save or export before starting another upload."}
            </p>
          </div>

          <StatusCountCards summary={job} />

          <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,440px)]">
            <div className="h-fit min-w-0 rounded-xl border bg-card p-5 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold">Save and export</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                Save reviewed good rows, then download them as an Excel file.
              </p>
              <div className="flex flex-wrap gap-2">
                <SaveReviewedRowsButton importId={importId} rows={rows} />
                <ExportMenu importId={importId} />
              </div>
            </div>

            <div className="h-fit min-w-0 rounded-xl border bg-card p-5 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold">Import Summary</h3>
              <div className="grid gap-1.5 text-sm">
                <div className="flex min-w-0 justify-between gap-4">
                  <span className="min-w-0 truncate text-muted-foreground">Total input rows</span>
                  <span className="shrink-0 font-medium">{job.total_rows}</span>
                </div>
                <div className="flex min-w-0 justify-between gap-4">
                  <span className="min-w-0 truncate text-muted-foreground">Good rows</span>
                  <span className="shrink-0 font-medium text-primary">{job.good_count}</span>
                </div>
                <div className="flex min-w-0 justify-between gap-4">
                  <span className="min-w-0 truncate text-muted-foreground">Missing rows</span>
                  <span className="shrink-0 font-medium">{job.missing_count}</span>
                </div>
                <div className="flex min-w-0 justify-between gap-4">
                  <span className="min-w-0 truncate text-muted-foreground">Skipped rows</span>
                  <span className="shrink-0 font-medium">{job.skipped_count}</span>
                </div>
                <div className="flex min-w-0 justify-between gap-4">
                  <span className="min-w-0 truncate text-muted-foreground">Blank rows removed</span>
                  <span className="shrink-0 font-medium">{job.blank_rows_removed}</span>
                </div>
                <div className="flex min-w-0 justify-between gap-4">
                  <span className="min-w-0 truncate text-muted-foreground">AI changed</span>
                  <span className="shrink-0 font-medium">{job.ai_changed_count}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ImportStepLayout>
    </AppShell>
  )
}
