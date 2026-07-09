import { AppShell } from "@/components/app-shell"
import { ImportStepLayout } from "@/components/import-step-layout"
import { LocalPreviewPage } from "@/components/local-preview-page"
import { requireCurrentUser } from "@/lib/server-api"

export default async function PreviewPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params
  await requireCurrentUser()

  return (
    <AppShell title="Raw preview" description="Confirm source sheets and rows before AI processing.">
      <ImportStepLayout importId={importId} currentStep={2}>
        <LocalPreviewPage importId={importId} />
      </ImportStepLayout>
    </AppShell>
  )
}
