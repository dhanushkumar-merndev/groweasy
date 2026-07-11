import { AppShell } from "@/components/app-shell"
import { ImportStepLayout } from "@/components/import-step-layout"
import { UploadDropzone } from "@/components/upload-dropzone"
import { requireCurrentUser, serverFetch } from "@/lib/server-api"
import type { Template } from "@/lib/types"

async function UploadForm() {
  const { templates } = await serverFetch<{ templates: Template[] }>("/templates")
  return <UploadDropzone templates={templates} />
}

export default async function UploadPage() {
  await requireCurrentUser()

  return (
    <AppShell title="Upload" description="Upload Excel or CSV files and choose a cleaning template.">
      <ImportStepLayout currentStep={0}>
        <UploadForm />
      </ImportStepLayout>
    </AppShell>
  )
}
