import { AppShell } from "@/components/app-shell"
import { ImportStepLayout } from "@/components/import-step-layout"
import { UploadClient } from "./upload-client"

export default async function UploadPage() {
  return (
    <AppShell title="Upload" description="Upload Excel or CSV files and choose a cleaning template.">
      <ImportStepLayout currentStep={0}>
        <UploadClient />
      </ImportStepLayout>
    </AppShell>
  )
}
