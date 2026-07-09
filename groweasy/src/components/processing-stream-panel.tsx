"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  CheckCircle2Icon,
  CpuIcon,
  RadioIcon,
  RotateCcwIcon,
  SendIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react"
import Lottie from "lottie-react"

import { Button } from "@/components/ui/button"
import { api, API_BASE } from "@/lib/api-client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { clearLocalValidationPreview, normalizeLocalValidationRows, readLocalValidationPreview } from "@/lib/local-validation-preview"
import { idbSet } from "@/lib/idb-store"
import { cn } from "@/lib/utils"
import loaderAnimation from "../../public/loader.json"

type StreamEvent =
  | {
      type: "batch_started"
      batch_no: number
      total_batches: number
      batch_rows: number
      ai_rows: number
      model: string
    }
  | {
      type: "batch_completed"
      batch_no: number
      total_batches: number
      good_count: number
      missing_count: number
      skipped_count: number
      ai_changed_count: number
    }
  | {
      type: "progress"
      processed_rows: number
      total_rows: number
      percent: number
    }
  | {
      type: "completed"
      import_id: string
      token_usage?: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
      }
    }
  | {
      type: "token_usage"
      token_usage: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
      }
    }
  | {
      type: "error"
      message: string
    }

type ActivityKind = "prepare" | "connect" | "send" | "receive" | "tokens" | "complete" | "error"

type ActivityItem = {
  id: number
  kind: ActivityKind
  title: string
  detail: string
}

type TokenUsage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

const MAX_VISIBLE_ACTIVITY = 4

export function ProcessingStreamPanel({ importId }: { importId: string }) {
  const router = useRouter()
  const sourceRef = useRef<EventSource | null>(null)
  const reviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedRef = useRef(false)
  const activityIdRef = useRef(0)
  const [pending, setPending] = useState(false)
  const [percent, setPercent] = useState(0)
  const [status, setStatus] = useState("Preparing AI processing")
  const [failed, setFailed] = useState(false)
  const [redirectSeconds, setRedirectSeconds] = useState<number | null>(null)
  const [processedRows, setProcessedRows] = useState(0)
  const [totalRows, setTotalRows] = useState(0)
  const [activeBatch, setActiveBatch] = useState<{ batchNo: number; totalBatches: number } | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([
    {
      id: 0,
      kind: "prepare",
      title: "Preparing stream",
      detail: "Waiting for the processing worker.",
    },
  ])
  const [counts, setCounts] = useState({
    good: 0,
    missing: 0,
    skipped: 0,
    changed: 0,
  })
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null)

  const pushActivity = useCallback((kind: ActivityKind, title: string, detail: string) => {
    activityIdRef.current += 1
    const nextItem = { id: activityIdRef.current, kind, title, detail }
    setActivity((items) => [nextItem, ...items].slice(0, MAX_VISIBLE_ACTIVITY))
  }, [])

  const startProcessing = useCallback(async () => {
    if (startedRef.current) return

    startedRef.current = true
    setPending(true)
    setFailed(false)
    setRedirectSeconds(null)
    setPercent(0)
    setProcessedRows(0)
    setTotalRows(0)
    setActiveBatch(null)
    activityIdRef.current = 0
    setActivity([
      {
        id: 0,
        kind: "prepare",
        title: "Preparing stream",
        detail: "Collecting validated rows before AI processing.",
      },
    ])
    setStatus("Starting AI batch processing")

    try {
      const localPreview = readLocalValidationPreview(importId)

      if (localPreview) {
        setStatus("Preparing validated rows")
        pushActivity("prepare", "Validated rows ready", `${localPreview.rows.length.toLocaleString()} rows queued for AI cleanup.`)

        const validateResponse = await api(`/imports/${importId}/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: normalizeLocalValidationRows(importId, localPreview.rows),
            blank_rows_removed: localPreview.blankRowsRemoved,
            remove_blank_rows: localPreview.removeBlankRows,
            dash_values_blank: localPreview.dashValuesBlank,
            require_both_email_phone: localPreview.requireBothEmailPhone,
          }),
        })

        if (!validateResponse.ok) {
          const data = (await validateResponse.json()) as { error?: { message?: string } }
          throw new Error(data.error?.message ?? "Could not prepare rows for AI.")
        }

        clearLocalValidationPreview(importId)
      }

      setStatus("Processing rows with AI")
      pushActivity("connect", "Opening live stream", "Connected to backend events for this import.")

      const source = new EventSource(`${API_BASE}/api/imports/${importId}/stream?force=1`, {
        withCredentials: true,
      })
      sourceRef.current = source

      source.onmessage = (event) => {
        const data = JSON.parse(event.data) as StreamEvent

        if (data.type === "batch_started") {
          setActiveBatch({ batchNo: data.batch_no, totalBatches: data.total_batches })
          setStatus(`Sending batch ${data.batch_no} / ${data.total_batches}`)
          pushActivity(
            "send",
            `Batch ${data.batch_no} sent`,
            `${data.batch_rows.toLocaleString()} rows in batch, ${data.ai_rows.toLocaleString()} need AI. ${formatModelName(data.model)}.`,
          )
        }

        if (data.type === "batch_completed") {
          setStatus(`Received batch ${data.batch_no} / ${data.total_batches}`)
          pushActivity(
            "receive",
            `Batch ${data.batch_no} received`,
            `${data.good_count.toLocaleString()} good, ${data.missing_count.toLocaleString()} missing, ${data.skipped_count.toLocaleString()} skipped so far.`,
          )
          setCounts({
            good: data.good_count,
            missing: data.missing_count,
            skipped: data.skipped_count,
            changed: data.ai_changed_count,
          })
        }

        if (data.type === "progress") {
          setPercent(data.percent)
          setProcessedRows(data.processed_rows)
          setTotalRows(data.total_rows)
        }

        if (data.type === "token_usage") {
          setTokenUsage(data.token_usage)
          if (data.token_usage.total_tokens > 0) {
            pushActivity(
              "tokens",
              "Token usage updated",
              `${data.token_usage.total_tokens.toLocaleString()} total tokens used so far.`,
            )
          }
          idbSet(`groweasy-token-usage:${importId}`, data.token_usage)
        }

        if (data.type === "error") {
          source.close()
          sourceRef.current = null
          startedRef.current = false
          setPending(false)
          setFailed(true)
          setStatus("Processing failed")
          pushActivity("error", "Processing failed", data.message)
          toast.error(data.message)
        }

        if (data.type === "completed") {
          if (data.token_usage) {
            setTokenUsage(data.token_usage)
            idbSet(`groweasy-token-usage:${importId}`, data.token_usage)
          }
          setPercent(100)
          setStatus("AI processing completed")
          pushActivity("complete", "Processing completed", "Clean rows are ready for review.")
          setPending(false)
          source.close()
          sourceRef.current = null
          setRedirectSeconds(5)
          countdownTimerRef.current = setInterval(() => {
            setRedirectSeconds((seconds) => {
              if (seconds === null || seconds <= 1) {
                return seconds
              }

              return seconds - 1
            })
          }, 1000)
          reviewTimerRef.current = setTimeout(() => {
            router.push(`/upload/${importId}/review`)
          }, 5000)
        }
      }

      source.onerror = () => {
        source.close()
        sourceRef.current = null
        startedRef.current = false
        setPending(false)
        setFailed(true)
        setStatus("Processing interrupted")
        pushActivity("error", "Stream interrupted", "Network disconnected during SSE processing.")
        toast.error("Network disconnected during SSE stream. Results can still be opened from Review.")
      }
    } catch (error) {
      startedRef.current = false
      setPending(false)
      setFailed(true)
      setStatus("Processing failed")
      pushActivity("error", "Processing failed", error instanceof Error ? error.message : "Could not complete processing.")
      toast.error(error instanceof Error ? error.message : "Processing failed.")
    }
  }, [importId, pushActivity, router])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void startProcessing()
    })

    return () => {
      window.cancelAnimationFrame(frame)
      sourceRef.current?.close()
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current)
      }
      if (reviewTimerRef.current) {
        clearTimeout(reviewTimerRef.current)
      }
    }
  }, [startProcessing])

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>AI batch processing</CardTitle>
        <CardDescription>Rows are processed in configurable batches and streamed as each batch completes.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid min-h-[42vh] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="grid content-center justify-items-center gap-5">
          <div className="size-48 sm:size-56">
            <Lottie animationData={loaderAnimation} loop={pending || redirectSeconds !== null} />
          </div>

          <div className="grid w-full max-w-xl gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{status}</span>
              <span className="text-sm text-muted-foreground">{percent}%</span>
            </div>
            <div className={pending ? "shine-track" : undefined}>
              <Progress value={percent} />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {activeBatch
                  ? `Batch ${activeBatch.batchNo} of ${activeBatch.totalBatches}`
                  : "Waiting for first batch"}
              </span>
              <span>
                {totalRows > 0
                  ? `${processedRows.toLocaleString()} / ${totalRows.toLocaleString()} rows`
                  : "Rows pending"}
              </span>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              {redirectSeconds !== null
                ? `Opening review in ${redirectSeconds} second${redirectSeconds === 1 ? "" : "s"}...`
                : pending
                  ? "AI is cleaning and formatting your rows."
                  : failed
                    ? "Processing stopped before completion."
                    : "Preparing your AI step."}
            </p>
          </div>
          </div>

          <LiveActivity items={activity} pending={pending} tokenUsage={tokenUsage} />
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Count label="Good" value={counts.good} active={pending} />
          <Count label="Missing" value={counts.missing} active={pending} />
          <Count label="Skipped" value={counts.skipped} active={pending} />
          <Count label="AI changed" value={counts.changed} active={pending} />
        </div>
        {tokenUsage && tokenUsage.total_tokens > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Count label="Prompt tokens" value={tokenUsage.prompt_tokens} active={pending} />
            <Count label="Completion tokens" value={tokenUsage.completion_tokens} active={pending} />
            <Count label="Total tokens" value={tokenUsage.total_tokens} active={pending} />
          </div>
        )}
        {failed && (
          <Button onClick={() => void startProcessing()} className="w-full sm:w-fit">
            <RotateCcwIcon className="size-4" />
            Retry processing
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function Count({ label, value, active = false }: { label: string; value: number; active?: boolean }) {
  const animatedValue = useAnimatedNumber(value)

  return (
    <div className={active ? "shine-card rounded-lg border p-3" : "rounded-lg border p-3"}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular-nums text-xl font-semibold">
        {animatedValue.toLocaleString()}
      </p>
    </div>
  )
}

function useAnimatedNumber(value: number) {
  const [displayValue, setDisplayValue] = useState(value)
  const previousValueRef = useRef(value)

  useEffect(() => {
    const startValue = previousValueRef.current
    const endValue = value
    const difference = Math.abs(endValue - startValue)

    if (difference === 0) {
      return
    }

    previousValueRef.current = endValue

    if (difference <= 2) {
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

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [value])

  return displayValue
}

function LiveActivity({
  items,
  pending,
  tokenUsage,
}: {
  items: ActivityItem[]
  pending: boolean
  tokenUsage: TokenUsage | null
}) {
  return (
    <div className="grid h-full content-start gap-3 rounded-lg border bg-background/45 p-3 overflow-auto">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <RadioIcon className={pending ? "size-4 animate-pulse text-primary" : "size-4 text-muted-foreground"} />
          <p className="text-sm font-medium">Live status</p>
        </div>
        <span className="rounded-md border px-2 py-1 text-xs text-muted-foreground">
          {pending ? "Streaming" : "Idle"}
        </span>
      </div>

      <div className={cn("rounded-md border bg-card/45 p-2.5", pending && "shine-card")}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-muted-foreground">Tokens</p>
          <p className="tabular-nums text-sm font-semibold">
            {tokenUsage ? tokenUsage.total_tokens.toLocaleString() : "Waiting"}
          </p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            <p>Prompt</p>
            <p className="tabular-nums text-foreground">{tokenUsage ? tokenUsage.prompt_tokens.toLocaleString() : "-"}</p>
          </div>
          <div>
            <p>Completion</p>
            <p className="tabular-nums text-foreground">{tokenUsage ? tokenUsage.completion_tokens.toLocaleString() : "-"}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        {items.slice(0, MAX_VISIBLE_ACTIVITY).map((item, index) => (
          <div
            key={item.id}
            className={cn(
              "grid grid-cols-[28px_1fr] gap-2 rounded-md border bg-card/70 p-2.5",
              index === 0 && "ring-1 ring-primary/25",
              index === 1 && "opacity-90",
              index === 2 && "opacity-75",
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

function ActivityIcon({ kind }: { kind: ActivityKind }) {
  const className = "size-3.5"

  if (kind === "send") return <SendIcon className={className} />
  if (kind === "receive") return <CheckCircle2Icon className={className} />
  if (kind === "tokens") return <ZapIcon className={className} />
  if (kind === "complete") return <SparklesIcon className={className} />
  if (kind === "connect") return <RadioIcon className={className} />

  return <CpuIcon className={className} />
}

function formatModelName(model: string) {
  if (model === "deterministic-skip-ai") {
    return "No AI call needed"
  }

  return model
}
