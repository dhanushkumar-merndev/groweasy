import { AppShellSkeleton } from "@/components/skeletons/app-shell-skeleton"
import { TableWorkspaceSkeleton } from "@/components/skeletons/page-skeletons"

export default function TemplateDetailLoading() {
  return (
    <AppShellSkeleton title="Template" description="Saved rows using this template, formatted for review and editing.">
      <TableWorkspaceSkeleton />
    </AppShellSkeleton>
  )
}
