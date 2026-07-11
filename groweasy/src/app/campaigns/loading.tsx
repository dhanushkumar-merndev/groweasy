import { AppShellSkeleton } from "@/components/skeletons/app-shell-skeleton"
import { CampaignsTableSkeleton } from "@/components/skeletons/page-skeletons"

export default function CampaignsLoading() {
  return (
    <AppShellSkeleton title="Campaigns" description="Select a template to view and edit its saved rows.">
      <CampaignsTableSkeleton />
    </AppShellSkeleton>
  )
}
