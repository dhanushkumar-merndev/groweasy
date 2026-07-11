import { AppShellSkeleton } from "@/components/skeletons/app-shell-skeleton"
import { AnalyticsDetailSkeleton } from "@/components/skeletons/page-skeletons"

export default function AnalyticsDetailLoading() {
  return (
    <AppShellSkeleton title="Template" description="Chart variants for saved rows across multiple chart types.">
      <AnalyticsDetailSkeleton />
    </AppShellSkeleton>
  )
}
