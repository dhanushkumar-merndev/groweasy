import { AppShellSkeleton } from "@/components/skeletons/app-shell-skeleton"
import { ExportSkeleton } from "@/components/skeletons/page-skeletons"

export default function ExportLoading() {
  return (
    <AppShellSkeleton title="Save / Export" description="Download or push your cleaned data.">
      <ExportSkeleton />
    </AppShellSkeleton>
  )
}
