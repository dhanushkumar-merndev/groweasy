import { AppShell } from "@/components/app-shell"
import { ImportStepLayout } from "@/components/import-step-layout"
import { UploadDropzone } from "@/components/upload-dropzone"
import { requireCurrentUser } from "@/server/auth/session"
import { store } from "@/server/repositories/store"

export default async function UploadPage() {
  const user = await requireCurrentUser()

  return (
    <AppShell title="Upload" description="Upload Excel or CSV files and choose a cleaning template.">
      <ImportStepLayout currentStep={0}>
        <UploadDropzone templates={store.listTemplates(user.id)} />
      </ImportStepLayout>
    </AppShell>
  )
}
