import Link from "next/link"
import { ArrowRightIcon, CheckCircle2Icon } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { ImportStepLayout } from "@/components/import-step-layout"
import { ProcessingStreamPanel } from "@/components/processing-stream-panel"
import { StatusCountCards } from "@/components/status-count-cards"
import { Button } from "@/components/ui/button"
import { requireCurrentUser, serverFetch } from "@/lib/server-api"
import type { ImportJob } from "@/lib/types"

export default async function ProcessPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params
  await requireCurrentUser()

  const data = await serverFetch<{ import: ImportJob }>(`/imports/${importId}`)

  if (!data.import) return null

  if (data.import.status === "processed" || data.import.status === "saved") {
    return (
      <AppShell title="AI Process" description="AI processing has already completed for this import.">
        <ImportStepLayout
          importId={importId}
          currentStep={3}
          importStatus={data.import.status}
        >
          <div className="grid min-h-[58vh] min-w-0 content-start gap-5 pt-2">
            <div className="min-w-0 rounded-xl border bg-card/60 p-5 shadow-sm">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
                    <CheckCircle2Icon className="size-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">AI processing completed</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Rows were cleaned and grouped into good, missing, skipped, and AI changed results.
                    </p>
                  </div>
                </div>
                <Button className="shrink-0" render={<Link href={`/upload/${importId}/review`} />}>
                  Open review
                  <ArrowRightIcon className="size-4" />
                </Button>
              </div>
            </div>

            <div className="min-w-0">
              <StatusCountCards summary={data.import} />
            </div>
          </div>
        </ImportStepLayout>
      </AppShell>
    )
  }

  return (
    <AppShell title="AI Process" description="Stream batch progress while rows are mapped and formatted.">
      <ImportStepLayout importId={importId} currentStep={3} importStatus={data.import.status}>
        <ProcessingStreamPanel importId={importId} />
      </ImportStepLayout>
    </AppShell>
  )
}
