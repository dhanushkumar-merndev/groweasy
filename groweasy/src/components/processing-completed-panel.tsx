"use client"

import { useEffect, useState } from "react"
import { CheckCircle2Icon, CpuIcon, RadioIcon, SparklesIcon, ZapIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { idbGet } from "@/lib/idb-store"
import { cn } from "@/lib/utils"
import type { ImportJob } from "@/lib/types"

type TokenUsage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export function ProcessingCompletedPanel({ importJob }: { importJob: ImportJob }) {
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null)

  useEffect(() => {
    idbGet<TokenUsage>(`groweasy-token-usage:${importJob.id}`).then(setTokenUsage)
  }, [importJob.id])

  const counts = {
    good: importJob.final_saved_count || importJob.good_count,
    missing: importJob.missing_count,
    skipped: importJob.skipped_count,
    changed: importJob.ai_changed_count,
  }

  const activityItems = [
    { kind: "complete" as const, title: "Processing completed", detail: "All batches processed successfully." },
    { kind: "tokens" as const, title: "Token usage", detail: `${tokenUsage?.total_tokens?.toLocaleString() ?? "—"} total tokens used.` },
    { kind: "receive" as const, title: "Results ready", detail: `${counts.good.toLocaleString()} good, ${counts.missing.toLocaleString()} missing, ${counts.skipped.toLocaleString()} skipped.` },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI batch processing</CardTitle>
        <CardDescription>Rows are processed in configurable batches and streamed as each batch completes.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid min-h-[42vh] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="grid content-center justify-items-center gap-5">
            <div className="flex size-24 items-center justify-center rounded-full bg-primary/10 ring-4 ring-primary/20 sm:size-32">
              <CheckCircle2Icon className="size-10 text-primary sm:size-14" />
            </div>

            <div className="grid w-full max-w-xl gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-primary">AI processing completed</span>
                <span className="text-sm text-muted-foreground">100%</span>
              </div>
              <div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-full rounded-full bg-primary transition-all" />
                </div>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Rows were cleaned and grouped into good, missing, skipped, and AI changed results.
              </p>
            </div>
          </div>

          <CompletedActivity items={activityItems} tokenUsage={tokenUsage} />
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Count label="Good" value={counts.good} />
          <Count label="Missing" value={counts.missing} />
          <Count label="Skipped" value={counts.skipped} />
          <Count label="AI changed" value={counts.changed} />
        </div>

        {tokenUsage && tokenUsage.total_tokens > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Count label="Prompt tokens" value={tokenUsage.prompt_tokens} />
            <Count label="Completion tokens" value={tokenUsage.completion_tokens} />
            <Count label="Total tokens" value={tokenUsage.total_tokens} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Count({ label, value }: { label: string; value: number }) {
  const animatedValue = useAnimatedNumber(value)

  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular-nums text-xl font-semibold">
        {animatedValue.toLocaleString()}
      </p>
    </div>
  )
}

function useAnimatedNumber(value: number) {
  const [displayValue, setDisplayValue] = useState(value)

  useEffect(() => {
    const startValue = displayValue
    const endValue = value
    const difference = Math.abs(endValue - startValue)

    if (difference === 0 || difference <= 2) {
      setDisplayValue(endValue)
      return
    }

    const duration = Math.min(950, Math.max(360, 180 + difference * 8))
    const startedAt = performance.now()
    let frameId = 0

    function tick(now: number) {
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      const nextValue = Math.round(startValue + (endValue - startValue) * eased)
      setDisplayValue(nextValue)
      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick)
      }
    }

    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [value])

  return displayValue
}

function CompletedActivity({
  items,
  tokenUsage,
}: {
  items: { kind: "complete" | "tokens" | "receive"; title: string; detail: string }[]
  tokenUsage: TokenUsage | null
}) {
  return (
    <div className="grid h-full content-start gap-3 rounded-lg border bg-background/45 p-3 overflow-auto">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <RadioIcon className="size-4 text-primary" />
          <p className="text-sm font-medium">Live status</p>
        </div>
        <span className="rounded-md border px-2 py-1 text-xs text-muted-foreground">Completed</span>
      </div>

      <div className="rounded-md border bg-card/45 p-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-muted-foreground">Tokens</p>
          <p className="tabular-nums text-sm font-semibold">
            {tokenUsage ? tokenUsage.total_tokens.toLocaleString() : "—"}
          </p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            <p>Prompt</p>
            <p className="tabular-nums text-foreground">{tokenUsage ? tokenUsage.prompt_tokens.toLocaleString() : "—"}</p>
          </div>
          <div>
            <p>Completion</p>
            <p className="tabular-nums text-foreground">{tokenUsage ? tokenUsage.completion_tokens.toLocaleString() : "—"}</p>
          </div>
        </div>
      </div>

      <div className="relative grid gap-2">
        {items.map((item, index) => (
          <div
            key={item.title}
            className={cn(
              "grid grid-cols-[28px_1fr] gap-2 rounded-md border bg-card/70 p-2.5",
              index === 0 && "ring-1 ring-primary/25",
            )}
          >
            <div className="mt-0.5 flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ActivityIcon kind={item.kind} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ActivityIcon({ kind }: { kind: string }) {
  const className = "size-3.5"
  if (kind === "receive") return <CheckCircle2Icon className={className} />
  if (kind === "tokens") return <ZapIcon className={className} />
  if (kind === "complete") return <SparklesIcon className={className} />
  return <CpuIcon className={className} />
}
