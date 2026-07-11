import { AppShellSkeleton } from "@/components/skeletons/app-shell-skeleton"
import { ReviewSkeleton } from "@/components/skeletons/page-skeletons"

export default function ReviewLoading() {
  return (
    <AppShellSkeleton title="Review" description="Edit good and missing rows, then permanently save only valid rows.">
      <ReviewSkeleton />
    </AppShellSkeleton>
  )
}
