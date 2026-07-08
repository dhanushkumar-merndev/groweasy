import Link from "next/link"
import { notFound } from "next/navigation"

import { AppShell } from "@/components/app-shell"
import { ImportStepLayout } from "@/components/import-step-layout"
import { ProcessingStreamPanel } from "@/components/processing-stream-panel"
import { Button } from "@/components/ui/button"
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"

export default async function ProcessPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params
  const user = await requireCurrentUser()
  const job = store.getImport(user.id, importId)

  if (!job) {
    notFound()
  }

  return (
    <AppShell title="AI Process" description="Stream batch progress while rows are mapped and formatted.">
      <ImportStepLayout
        importId={importId}
        currentStep={3}
        primaryAction={<Button className="flex-1" render={<Link href={`/upload/${importId}/review`} />}>Open review</Button>}
      >
        <ProcessingStreamPanel importId={importId} />
      </ImportStepLayout>
    </AppShell>
  )
}
