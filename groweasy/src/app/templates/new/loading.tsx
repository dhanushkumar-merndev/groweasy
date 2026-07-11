import { AppShellSkeleton } from "@/components/skeletons/app-shell-skeleton"
import { TemplateFormSkeleton } from "@/components/skeletons/page-skeletons"

export default function NewTemplateLoading() {
  return (
    <AppShellSkeleton title="Create Template" description="Build a CRM-style schema with your own columns and formatting.">
      <TemplateFormSkeleton columns={1} />
    </AppShellSkeleton>
  )
}
