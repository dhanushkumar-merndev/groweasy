import { AppShellSkeleton } from "@/components/skeletons/app-shell-skeleton"
import { UploadDetailSkeleton } from "@/components/skeletons/page-skeletons"

export default function UploadDetailLoading() {
  return (
    <AppShellSkeleton title="Upload" description="Upload Excel or CSV files and choose a cleaning template.">
      <UploadDetailSkeleton />
    </AppShellSkeleton>
  )
}
