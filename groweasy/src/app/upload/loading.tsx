import { AppShellSkeleton } from "@/components/skeletons/app-shell-skeleton"
import { ImportStepLayout } from "@/components/import-step-layout"
import { UploadDropzoneSkeleton } from "@/components/skeletons/page-skeletons"

export default function UploadLoading() {
  return (
    <AppShellSkeleton title="Upload" description="Upload Excel or CSV files and choose a cleaning template.">
      <ImportStepLayout currentStep={0}>
        <UploadDropzoneSkeleton />
      </ImportStepLayout>
    </AppShellSkeleton>
  )
}
