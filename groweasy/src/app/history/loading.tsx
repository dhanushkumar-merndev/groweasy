import { AppShellSkeleton } from "@/components/skeletons/app-shell-skeleton"
import { HistoryListSkeleton } from "@/components/skeletons/page-skeletons"

export default function HistoryLoading() {
  return (
    <AppShellSkeleton title="History" description="Permanent count-based events for uploads, saves, row changes, and exports.">
      <HistoryListSkeleton />
    </AppShellSkeleton>
  )
}
