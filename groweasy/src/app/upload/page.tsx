import { AppShell } from "@/components/app-shell"
import { ImportStepLayout } from "@/components/import-step-layout"
import { UploadDropzone } from "@/components/upload-dropzone"
import { requireCurrentUser, serverFetch } from "@/lib/server-api"
import type { Template } from "@/lib/types"

export default async function UploadPage() {
  await requireCurrentUser()

  const { templates } = await serverFetch<{ templates: Template[] }>("/templates")

  return (
    <AppShell title="Upload" description="Upload Excel or CSV files and choose a cleaning template.">
      <ImportStepLayout currentStep={0}>
        <UploadDropzone templates={templates} />
      </ImportStepLayout>
    </AppShell>
  )
}
