import { AppShellSkeleton } from "@/components/skeletons/app-shell-skeleton"
import { ProcessSkeleton } from "@/components/skeletons/page-skeletons"

export default function ProcessLoading() {
  return (
    <AppShellSkeleton title="AI Process" description="Stream batch progress while rows are mapped and formatted.">
      <ProcessSkeleton />
    </AppShellSkeleton>
  )
}
