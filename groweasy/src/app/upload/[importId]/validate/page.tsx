import Link from "next/link"
import { notFound } from "next/navigation"

import { ImportStepLayout } from "@/components/import-step-layout"
import { RawPreviewTable, ValidationWarnings } from "@/components/raw-preview-table"
import { SheetTabs } from "@/components/sheet-tabs"
import { Button } from "@/components/ui/button"
import { AppShell } from "@/components/app-shell"
import type { ValidationResult } from "@/lib/types"
import { cacheKeys, getCache } from "@/server/redis/cache"
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"

export default async function ValidatePage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params
  const user = await requireCurrentUser()
  const job = store.getImport(user.id, importId)

  if (!job) {
    notFound()
  }

  const validation = await getCache<ValidationResult>(cacheKeys(importId).validation)

  if (!validation) {
    notFound()
  }

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
