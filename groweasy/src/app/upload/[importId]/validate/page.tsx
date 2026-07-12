import { AppShell } from "@/components/app-shell"
import { ImportStepLayout } from "@/components/import-step-layout"
import { LocalValidatePage } from "@/components/local-validate-page"

export default async function ValidatePage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params

  return (
    <AppShell title="Validate" description="Deterministic cleanup before AI processing.">
      <ImportStepLayout importId={importId} currentStep={1}>
        <LocalValidatePage importId={importId} />
      </ImportStepLayout>
    </AppShell>
  )
}
