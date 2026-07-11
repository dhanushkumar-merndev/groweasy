import { AppShellSkeleton } from "@/components/skeletons/app-shell-skeleton"
import { TemplateCardsSkeleton } from "@/components/skeletons/page-skeletons"

export default function TemplatesLoading() {
  return (
    <AppShellSkeleton title="Templates" description="The default GrowEasy CRM lead schema used for every upload.">
      <TemplateCardsSkeleton includeCreate />
    </AppShellSkeleton>
  )
}
