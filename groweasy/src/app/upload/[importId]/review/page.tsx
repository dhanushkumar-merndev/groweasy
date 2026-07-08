import { AppShell } from "@/components/app-shell"
import { ImportStepLayout } from "@/components/import-step-layout"
import { ReviewWorkspace } from "@/components/review-workspace"
import { StatusCountCards } from "@/components/status-count-cards"
import { requireCurrentUser, serverFetch } from "@/lib/server-api"
import type { CleanedRow, ImportJob, Template } from "@/lib/types"

export default async function ReviewPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params
  await requireCurrentUser()

  const importData = await serverFetch<{ import: ImportJob; template: Template | null; cleaned_rows: CleanedRow[] }>(
    `/imports/${importId}`
  )
  const { import: job, template } = importData

  if (!job || !template) return null

  const results = await serverFetch<{ rows: CleanedRow[] }>(`/imports/${importId}/results`)
  const rows = results.rows

  return (
    <AppShell title="Review" description="Edit good and missing rows, then permanently save only valid rows.">
      <ImportStepLayout importId={importId} currentStep={4}>
        <div className="grid gap-4">
          <StatusCountCards summary={job} />
          <ReviewWorkspace importId={importId} rows={rows} template={template} />
        </div>
      </ImportStepLayout>
    </AppShell>
  )
}
