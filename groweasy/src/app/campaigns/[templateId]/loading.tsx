import { AppShellSkeleton } from "@/components/skeletons/app-shell-skeleton"
import { TableWorkspaceSkeleton } from "@/components/skeletons/page-skeletons"

export default function CampaignDetailLoading() {
  return (
    <AppShellSkeleton title="Template" description="Editable saved rows table.">
      <TableWorkspaceSkeleton />
    </AppShellSkeleton>
  )
}
