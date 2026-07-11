import { AppShellSkeleton } from "@/components/skeletons/app-shell-skeleton"
import { DashboardPageSkeleton } from "@/components/skeletons/dashboard-skeleton"
import { SkeletonActionButton } from "@/components/skeletons/page-skeletons"

export default function DashboardLoading() {
  return (
    <AppShellSkeleton
      title="Dashboard"
      description="Monitor imports, saved rows, templates, and AI cleaning history."
      actions={<SkeletonActionButton />}
    >
      <DashboardPageSkeleton />
    </AppShellSkeleton>
  )
}
