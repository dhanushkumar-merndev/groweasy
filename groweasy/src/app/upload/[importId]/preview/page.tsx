import Link from "next/link"
import { notFound } from "next/navigation"

import { AppShell } from "@/components/app-shell"
import { ImportStepLayout } from "@/components/import-step-layout"
import { RawPreviewTable } from "@/components/raw-preview-table"
import { Button } from "@/components/ui/button"
import type { ValidationResult } from "@/lib/types"
import { requireCurrentUser } from "@/server/auth/session"
import { cacheKeys, getCache } from "@/server/redis/cache"
import { store } from "@/server/repositories/store"

export default async function PreviewPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params
  const user = await requireCurrentUser()
  const job = store.getImport(user.id, importId)
  const validation = await getCache<ValidationResult>(cacheKeys(importId).validation)

  if (!job || !validation) {
    notFound()
  }

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
