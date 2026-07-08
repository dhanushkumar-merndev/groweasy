import Link from "next/link"

import { AppShell } from "@/components/app-shell"
import { ImportStepLayout } from "@/components/import-step-layout"
import { ProcessingStreamPanel } from "@/components/processing-stream-panel"
import { Button } from "@/components/ui/button"
import { requireCurrentUser, serverFetch } from "@/lib/server-api"
import type { ImportJob } from "@/lib/types"

export default async function ProcessPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params
  await requireCurrentUser()

  const data = await serverFetch<{ import: ImportJob }>(`/imports/${importId}`)

  if (!data.import) return null

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
