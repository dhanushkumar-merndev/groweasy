import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function SkeletonActionButton() {
  return (
    <Button disabled>
      <Skeleton className="size-4" />
      <Skeleton className="h-4 w-14" />
    </Button>
  )
}

export function BreadcrumbSkeleton({ items = 2 }: { items?: number }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} className="flex items-center gap-2">
          <Skeleton className="h-5 w-20" />
          {index < items - 1 ? <Skeleton className="h-5 w-5" /> : null}
        </div>
      ))}
    </div>
  )
}

export function MetricCardsSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-16 rounded-lg" />
      ))}
    </div>
  )
}

export function TemplateCardsSkeleton({ includeCreate = false }: { includeCreate?: boolean }) {
  return (
    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 2 }).map((_, index) => (
        <Card key={index} className="h-fit py-0">
          <div className="grid gap-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="grid gap-1">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 5 }).map((_, pillIndex) => (
                <Skeleton key={pillIndex} className="h-5 w-20 rounded-full" />
              ))}
            </div>
            <Skeleton className="h-3 w-48" />
          </div>
        </Card>
      ))}
      {includeCreate ? (
        <Card className="h-fit border-dashed py-0">
          <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Skeleton className="size-12 rounded-full" />
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3 w-52" />
          </div>
        </Card>
      ) : null}
    </div>
  )
}

export function AnalyticsDetailSkeleton() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-8 w-28" />
      <div className="grid gap-1">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <MetricCardsSkeleton />
      <div className="grid gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-[300px] w-full rounded-lg" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-[260px] rounded-lg md:col-span-2" />
          <Skeleton className="h-[200px] rounded-lg" />
          <Skeleton className="h-[200px] rounded-lg" />
        </div>
      </div>
    </div>
  )
}

export function TableWorkspaceSkeleton({ withBack = true }: { withBack?: boolean }) {
  return (
    <>
      {withBack ? <Skeleton className="h-8 w-28" /> : null}
      <MetricCardsSkeleton />
      <Card>
        <CardContent className="p-4">
          <Skeleton className="mb-4 h-9 w-full" />
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  )
}

export function CampaignsTableSkeleton() {
  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader>
        <Skeleton className="h-5 w-36" />
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-1">
          <div className="grid grid-cols-6 gap-4 border-b pb-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="grid grid-cols-6 gap-4 border-b py-2.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="ml-auto h-8 w-24" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function HistoryListSkeleton() {
  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-2">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,auto)_minmax(0,auto)] gap-4 border-b pb-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-10" />
          </div>
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,auto)_minmax(0,auto)] items-center gap-4 border-b py-2.5 last:border-0">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-32" />
              <div className="flex gap-2 justify-end">
                <Skeleton className="h-8 w-14" />
                <Skeleton className="h-8 w-20" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
      <div className="flex items-center justify-between border-t px-4 py-3">
        <Skeleton className="h-4 w-28" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>
    </Card>
  )
}

export function TemplateFormSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-36" />
      </div>
      <div className="rounded-lg border bg-card/40 p-4">
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      </div>
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Skeleton className="h-5 w-20" />
            <Skeleton className="mt-1 h-3 w-36" />
          </div>
        </div>
        {Array.from({ length: columns }).map((_, index) => (
          <div key={index} className="grid gap-4 rounded-lg border bg-card/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-8 w-24" />
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.55fr)]">
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.45fr)]">
                  <div className="grid gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                  <div className="grid gap-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </div>
              <div className="grid gap-3 content-start">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 8 }).map((_, ci) => (
                    <Skeleton key={ci} className="h-9 w-full rounded-md" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Skeleton className="h-8 w-32" />
      </div>
    </div>
  )
}

export function UploadDropzoneSkeleton() {
  return (
    <div className="grid gap-8 pb-10">
      <div className="grid gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid flex-1 gap-3 sm:max-w-md">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <Skeleton className="h-10 w-20 rounded-lg" />
            <Skeleton className="h-10 w-24 rounded-lg" />
          </div>
        </div>

        <div className="flex min-h-[44vh] flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/5 p-6 text-center">
          <Skeleton className="size-16 rounded-full" />
          <div className="grid justify-items-center gap-2">
            <Skeleton className="h-6 w-72 max-w-[70vw]" />
            <Skeleton className="h-4 w-80 max-w-[74vw]" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function UploadDetailSkeleton() {
  return (
    <>
      <BreadcrumbSkeleton items={3} />
      <Card>
        <CardContent className="grid gap-4 p-6">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </CardContent>
      </Card>
    </>
  )
}

export function ProcessSkeleton() {
  return (
    <>
      <BreadcrumbSkeleton />
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-4 p-8">
          <Skeleton className="size-12 rounded-full" />
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-1.5 w-full max-w-xs rounded-full" />
        </CardContent>
      </Card>
    </>
  )
}

export function ReviewSkeleton() {
  return (
    <>
      <BreadcrumbSkeleton />
      <div className="grid gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-20" />
        </div>
        <TableWorkspaceSkeleton withBack={false} />
      </div>
    </>
  )
}

export function ExportSkeleton() {
  return (
    <>
      <BreadcrumbSkeleton />
      <div className="grid gap-4">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-6 w-48" />
        <MetricCardsSkeleton />
        <div className="grid items-start gap-4 xl:grid-cols-[1fr_360px]">
          <Card>
            <CardContent className="grid gap-3 p-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-64" />
              <div className="flex gap-2">
                <Skeleton className="h-9 w-32" />
                <Skeleton className="h-9 w-28" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="grid gap-2 p-5">
              <Skeleton className="h-4 w-32" />
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-8" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
