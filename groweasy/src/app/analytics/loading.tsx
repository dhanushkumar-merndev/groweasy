import { AppShellSkeleton } from "@/components/skeletons/app-shell-skeleton"
import { TemplateCardsSkeleton } from "@/components/skeletons/page-skeletons"

export default function AnalyticsLoading() {
  return (
    <AppShellSkeleton title="Analytics" description="Select a template to inspect and edit its saved rows.">
      <TemplateCardsSkeleton />
    </AppShellSkeleton>
  )
}
