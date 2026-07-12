import { redirect } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { ImportStepLayout } from "@/components/import-step-layout"
import { ProcessingCompletedPanel } from "@/components/processing-completed-panel"
import { ProcessingStreamPanel } from "@/components/processing-stream-panel"
import { serverFetch } from "@/lib/server-api"
import type { ImportJob } from "@/lib/types"

export default async function ProcessPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params

  const data = await serverFetch<{ import: ImportJob }>(`/imports/${importId}`)

  if (!data.import) redirect("/upload")

  if (data.import.status === "processed" || data.import.status === "saved") {
    return (
      <AppShell title="AI Process" description="AI processing has already completed for this import.">
        <ImportStepLayout importId={importId} currentStep={3} importStatus={data.import.status}>
          <ProcessingCompletedPanel importJob={data.import} />
        </ImportStepLayout>
      </AppShell>
    )
  }

  return (
    <AppShell title="AI Process" description="Stream batch progress while rows are mapped and formatted.">
      <ImportStepLayout importId={importId} currentStep={3} importStatus={data.import.status}>
        <ProcessingStreamPanel importId={importId} />
      </ImportStepLayout>
    </AppShell>
  )
}
