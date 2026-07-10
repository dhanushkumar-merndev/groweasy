import { Skeleton } from "@/components/ui/skeleton"

export function UploadSkeleton() {
  return (
    <div className="grid gap-8 pb-10">
      <div className="grid gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid gap-3 flex-1 max-w-md">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-20 rounded-lg" />
            <Skeleton className="h-10 w-24 rounded-lg" />
          </div>
        </div>

        <Skeleton className="flex min-h-[44vh] flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed">
          <Skeleton className="size-16 rounded-full" />
          <Skeleton className="h-6 w-72" />
          <Skeleton className="h-4 w-56" />
        </Skeleton>
      </div>
    </div>
  )
}
