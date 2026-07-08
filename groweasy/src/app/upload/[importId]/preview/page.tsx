import Link from "next/link"

import { AppShell } from "@/components/app-shell"
import { ImportStepLayout } from "@/components/import-step-layout"
import { RawPreviewTable } from "@/components/raw-preview-table"
import { Button } from "@/components/ui/button"
import { requireCurrentUser, serverFetch } from "@/lib/server-api"
import type { ImportJob, ValidationResult } from "@/lib/types"

export default async function PreviewPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params
  await requireCurrentUser()

  const data = await serverFetch<{ import: ImportJob; validation: ValidationResult | null }>(
    `/imports/${importId}`
  )
  const { import: job, validation } = data

  if (!job || !validation) return null

  return (
    <AppShell title="Raw preview" description="Confirm source sheets and rows before AI processing.">
      <ImportStepLayout
        importId={importId}
        currentStep={2}
        primaryAction={<Button className="flex-1" render={<Link href={`/upload/${importId}/process`} />}>Start AI step</Button>}
        secondaryAction={<Button variant="outline" className="flex-1" render={<Link href={`/upload/${importId}/validate`} />}>Back</Button>}
      >
        <RawPreviewTable rows={validation.rows} />
      </ImportStepLayout>
    </AppShell>
  )
}
