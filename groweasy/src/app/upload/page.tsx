import { Suspense } from "react"
import dynamic from "next/dynamic"

import { AppShell } from "@/components/app-shell"
import { ImportStepLayout } from "@/components/import-step-layout"
import { requireCurrentUser, serverFetch } from "@/lib/server-api"
import { UploadSkeleton } from "@/components/upload-skeleton"
import type { Template } from "@/lib/types"

const UploadDropzone = dynamic(
  () => import("@/components/upload-dropzone").then((m) => ({ default: m.UploadDropzone })),
  { loading: () => <UploadSkeleton /> },
)

async function UploadForm() {
  const { templates } = await serverFetch<{ templates: Template[] }>("/templates")
  return <UploadDropzone templates={templates} />
}

export default async function UploadPage() {
  await requireCurrentUser()

  return (
    <AppShell title="Upload" description="Upload Excel or CSV files and choose a cleaning template.">
      <Suspense fallback={<ImportStepLayout currentStep={0}><UploadSkeleton /></ImportStepLayout>}>
        <ImportStepLayout currentStep={0}>
          <UploadForm />
        </ImportStepLayout>
      </Suspense>
    </AppShell>
  )
}
