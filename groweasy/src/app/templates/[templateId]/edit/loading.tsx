import { AppShellSkeleton } from "@/components/skeletons/app-shell-skeleton"
import { TemplateFormSkeleton } from "@/components/skeletons/page-skeletons"

export default function EditTemplateLoading() {
  return (
    <AppShellSkeleton title="Edit Template" description="Loading...">
      <TemplateFormSkeleton />
    </AppShellSkeleton>
  )
}
