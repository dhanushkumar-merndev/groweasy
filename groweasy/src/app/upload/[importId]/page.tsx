import { AppShell } from "@/components/app-shell"
import { ImportStepLayout } from "@/components/import-step-layout"
import { LocalUploadDetail } from "@/components/local-upload-detail"
import { serverFetch } from "@/lib/server-api"
import type { Template } from "@/lib/types"

export default async function UploadedImportPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params
  const { templates } = await serverFetch<{ templates: Template[] }>("/templates")

  return (
    <AppShell title="Upload" description="Upload Excel or CSV files and choose a cleaning template.">
      <ImportStepLayout importId={importId} currentStep={0}>
        <LocalUploadDetail importId={importId} templates={templates} />
      </ImportStepLayout>
    </AppShell>
  )
}
