import Link from "next/link"

import { ImportStepLayout } from "@/components/import-step-layout"
import { RawPreviewTable, ValidationWarnings } from "@/components/raw-preview-table"
import { SheetTabs } from "@/components/sheet-tabs"
import { Button } from "@/components/ui/button"
import { AppShell } from "@/components/app-shell"
import { requireCurrentUser, serverFetch } from "@/lib/server-api"
import type { ImportJob, ValidationResult } from "@/lib/types"

export default async function ValidatePage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params
  await requireCurrentUser()

  const data = await serverFetch<{ import: ImportJob; validation: ValidationResult | null }>(
    `/imports/${importId}`
  )
  const { import: job, validation } = data

  if (!job || !validation) return null

  return (
    <AppShell title="Validate" description={`${job.file_name} passed deterministic cleanup before AI.`}>
      <ImportStepLayout
        importId={importId}
        currentStep={1}
        primaryAction={<Button className="flex-1" render={<Link href={`/upload/${importId}/preview`} />}>Preview raw rows</Button>}
      >
        <div className="grid gap-4">
          <ValidationWarnings warnings={validation.warnings} />
          <SheetTabs sheets={validation.sheets} basePath={`/upload/${importId}/validate`} />
          <RawPreviewTable rows={validation.rows} />
        </div>
      </ImportStepLayout>
    </AppShell>
  )
}
