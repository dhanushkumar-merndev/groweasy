import { AppShell } from "@/components/app-shell"
import { DashboardPageSkeleton } from "@/components/skeletons/dashboard-skeleton"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"

export default function DashboardLoading() {
  return (
    <AppShell
      title="Dashboard"
      description="Monitor imports, saved rows, templates, and AI cleaning history."
      actions={
        <Button disabled>
          <Skeleton className="size-4" />
          <Skeleton className="h-4 w-14" />
        </Button>
      }
    >
      <DashboardPageSkeleton />
    </AppShell>
  )
}
