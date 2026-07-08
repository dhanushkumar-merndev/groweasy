import { notFound } from "next/navigation"

import { AppShell } from "@/components/app-shell"
import { ImportStepLayout } from "@/components/import-step-layout"
import { ReviewWorkspace } from "@/components/review-workspace"
import { StatusCountCards } from "@/components/status-count-cards"
import { getProcessedRows } from "@/server/ai/excel-cleaner"
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"

export default async function ReviewPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params
  const user = await requireCurrentUser()
  const job = store.getImport(user.id, importId)

  if (!job) {
    notFound()
  }

  const template = store.getTemplate(user.id, job.template_id)

  if (!template) {
    notFound()
  }

  const rows = await getProcessedRows(importId, job.updated_at)

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
