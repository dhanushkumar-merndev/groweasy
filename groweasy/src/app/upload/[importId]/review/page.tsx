import { redirect } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { ImportStepLayout } from "@/components/import-step-layout"
import { ReviewNav, ReviewWorkspace } from "@/components/review-workspace"
import { serverFetch } from "@/lib/server-api"
import type { CleanedRow, ImportJob, Template, ValidationResult } from "@/lib/types"

export default async function ReviewPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params

  const importData = await serverFetch<{ import: ImportJob; template: Template | null; validation?: ValidationResult; cleaned_rows: CleanedRow[] }>(
    `/imports/${importId}`
  )
  const { import: job, template } = importData

  if (!job || !template) redirect("/upload")

  const results = await serverFetch<{ rows: CleanedRow[] }>(`/imports/${importId}/results`)
  const rows = results.rows

  return (
    <AppShell title="Review" description="Edit good and missing rows, then permanently save only valid rows.">
      <ImportStepLayout importId={importId} currentStep={4} importStatus={job.status}>
        <div className="grid min-w-0 gap-4">
          <ReviewNav importId={importId} />
          <ReviewWorkspace
            importId={importId}
            rows={rows}
            template={template}
            requireBothEmailPhone={importData.validation?.require_both_email_phone === true}
          />
        </div>
      </ImportStepLayout>
    </AppShell>
  )
}
