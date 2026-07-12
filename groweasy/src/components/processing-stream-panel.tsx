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
import { api } from "@/lib/api-client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { clearLocalValidationPreview, ensureLocalValidationPreview, normalizeLocalValidationRows } from "@/lib/local-validation-preview"
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
      batch_good_count?: number
      batch_missing_count?: number
      batch_skipped_count?: number
      batch_ai_changed_count?: number
      batch_output_rows?: number
      ai_rows?: number
      ai_used?: boolean
      batch_token_usage?: TokenUsage
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

type ActivityKind = "prepare" | "connect" | "send" | "receive" | "tokens" | "complete" | "error" | "fallback"

type ActivityItem = {
  id: number
  kind: ActivityKind
  title: string
  detail: string
  leaving?: boolean
}

type DisplayActivityItem = {
  item: ActivityItem
  slot: number
  entering: boolean
  exiting: boolean
}

type TokenUsage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

type CurrentBatchStatus = {
  batchNo: number
  totalBatches: number
  inputRows: number
  aiRows: number
  outputRows: number | null
  good: number | null
  missing: number | null
  skipped: number | null
  changed: number | null
  model: string
  aiUsed: boolean | null
  tokenUsage: TokenUsage | null
  phase: "sent" | "received" | "fallback"
}

const MAX_VISIBLE_ACTIVITY = 3
const ACTIVITY_CARD_HEIGHT = 76
const ACTIVITY_CARD_GAP = 8

export function ProcessingStreamPanel({ importId }: { importId: string }) {
  const router = useRouter()
  const sourceRef = useRef<EventSource | null>(null)
  const reviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedRef = useRef(false)
  const activityIdRef = useRef(0)
  const aiFallbackUsedRef = useRef(false)
  const batchStartsRef = useRef(new Map<number, { inputRows: number; aiRows: number; model: string }>())
  const [pending, setPending] = useState(false)
  const [percent, setPercent] = useState(0)
  const [status, setStatus] = useState("Preparing AI processing")
  const [failed, setFailed] = useState(false)
  const [redirectSeconds, setRedirectSeconds] = useState<number | null>(null)
  const [processedRows, setProcessedRows] = useState(0)
  const [totalRows, setTotalRows] = useState(0)
  const [activeBatch, setActiveBatch] = useState<{ batchNo: number; totalBatches: number } | null>(null)
  const [currentBatchStatus, setCurrentBatchStatus] = useState<CurrentBatchStatus | null>(null)
  const [aiFallbackUsed, setAiFallbackUsed] = useState(false)
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
    setActivity((prev) => [nextItem, ...prev].slice(0, MAX_VISIBLE_ACTIVITY))
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
    setCurrentBatchStatus(null)
    setTokenUsage(null)
    aiFallbackUsedRef.current = false
    batchStartsRef.current = new Map()
    setAiFallbackUsed(false)
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
      const localPreview = await ensureLocalValidationPreview(importId)

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
            generate_description: localPreview.generateDescription,
            correct_spelling: localPreview.correctSpelling,
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

      const source = new EventSource(`/api/imports/${importId}/stream?force=1`, {
        withCredentials: true,
      })
      sourceRef.current = source

      source.onmessage = (event) => {
        const data = JSON.parse(event.data) as StreamEvent

        if (data.type === "batch_started") {
          const nextBatch = { batchNo: data.batch_no, totalBatches: data.total_batches }
          batchStartsRef.current.set(data.batch_no, {
            inputRows: data.batch_rows,
            aiRows: data.ai_rows,
            model: data.model,
          })
          setActiveBatch(nextBatch)
          setCurrentBatchStatus((current) => current ?? {
              batchNo: data.batch_no,
              totalBatches: data.total_batches,
              inputRows: data.batch_rows,
              aiRows: data.ai_rows,
              outputRows: null,
              good: null,
              missing: null,
              skipped: null,
              changed: null,
              model: data.model,
              aiUsed: null,
              tokenUsage: null,
              phase: "sent",
            })
          setStatus(`Sending batch ${data.batch_no} / ${data.total_batches}`)
          pushActivity(
            "send",
            `Batch ${data.batch_no} sent`,
            `${data.batch_rows.toLocaleString()} rows in batch, ${data.ai_rows.toLocaleString()} need AI. ${formatModelName(data.model)}.`,
          )
        }

        if (data.type === "batch_completed") {
          const usedFallback = Boolean(data.ai_rows && data.ai_rows > 0 && !data.ai_used)
          if (usedFallback) {
            aiFallbackUsedRef.current = true
            setAiFallbackUsed(true)
          }
          const startedBatch = batchStartsRef.current.get(data.batch_no)
          setCurrentBatchStatus({
            batchNo: data.batch_no,
            totalBatches: data.total_batches,
            inputRows: startedBatch?.inputRows ?? data.batch_output_rows ?? 0,
            aiRows: data.ai_rows ?? startedBatch?.aiRows ?? 0,
            outputRows: data.batch_output_rows ?? (
              (data.batch_good_count ?? 0) +
              (data.batch_missing_count ?? 0) +
              (data.batch_skipped_count ?? 0)
            ),
            good: data.batch_good_count ?? null,
            missing: data.batch_missing_count ?? null,
            skipped: data.batch_skipped_count ?? null,
            changed: data.batch_ai_changed_count ?? null,
            model: startedBatch?.model ?? "",
            aiUsed: Boolean(data.ai_used),
            tokenUsage: hasUsableTokenUsage(data.batch_token_usage) ? data.batch_token_usage : null,
            phase: usedFallback ? "fallback" : "received",
          })
          setStatus(usedFallback ? `Fallback completed batch ${data.batch_no} / ${data.total_batches}` : `Received batch ${data.batch_no} / ${data.total_batches}`)
          pushActivity(
            usedFallback ? "fallback" : "receive",
            usedFallback ? `Batch ${data.batch_no} used fallback` : `Batch ${data.batch_no} received`,
            usedFallback
              ? `${data.ai_rows?.toLocaleString()} rows needed AI, but no successful model response was used.`
              : `${data.good_count.toLocaleString()} good, ${data.missing_count.toLocaleString()} missing, ${data.skipped_count.toLocaleString()} skipped so far.`,
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
          if (hasUsableTokenUsage(data.token_usage)) {
            setTokenUsage(data.token_usage)
            pushActivity(
              "tokens",
              "Token usage updated",
              `${data.token_usage.total_tokens.toLocaleString()} total tokens used so far.`,
            )
            idbSet(`groweasy-token-usage:${importId}`, data.token_usage)
          }
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
          if (hasUsableTokenUsage(data.token_usage)) {
            setTokenUsage(data.token_usage)
            idbSet(`groweasy-token-usage:${importId}`, data.token_usage)
          }
          window.sessionStorage.removeItem(`groweasy-review-draft:${importId}`)
          setPercent(100)
          const completedWithFallback = aiFallbackUsedRef.current
          setStatus(completedWithFallback ? "Processing completed with fallback" : "AI processing completed")
          pushActivity(
            completedWithFallback ? "fallback" : "complete",
            completedWithFallback ? "Fallback completed" : "Processing completed",
            completedWithFallback ? "Clean rows are ready, but AI did not return usable output for at least one batch." : "Clean rows are ready for review.",
          )
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

          <LiveActivity
            items={activity}
            pending={pending}
            tokenUsage={tokenUsage}
            currentBatchStatus={currentBatchStatus}
            aiFallbackUsed={aiFallbackUsed}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Count label="Good" value={counts.good} active={pending} />
          <Count label="Missing" value={counts.missing} active={pending} />
          <Count label="Skipped" value={counts.skipped} active={pending} />
          <Count label="AI changed" value={counts.changed} active={pending} />
        </div>
        {tokenUsage && tokenUsage.total_tokens > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Count label="Input tokens" value={tokenUsage.prompt_tokens} active={pending} />
            <Count label="Output tokens" value={tokenUsage.completion_tokens} active={pending} />
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
  currentBatchStatus,
  aiFallbackUsed,
}: {
  items: ActivityItem[]
  pending: boolean
  tokenUsage: TokenUsage | null
  currentBatchStatus: CurrentBatchStatus | null
  aiFallbackUsed: boolean
}) {
  const [displayItems, setDisplayItems] = useState<DisplayActivityItem[]>(() =>
    items.slice(0, MAX_VISIBLE_ACTIVITY).map((item, slot) => ({
      item,
      slot,
      entering: false,
      exiting: false,
    })),
  )

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDisplayItems((current) => {
        const currentActive = current.filter((entry) => !entry.exiting)
        const currentIds = new Set(currentActive.map((entry) => entry.item.id))
        const nextItems = items.slice(0, MAX_VISIBLE_ACTIVITY)
        const nextIds = new Set(nextItems.map((item) => item.id))
        const nextDisplay = nextItems.map((item, slot) => ({
          item,
          slot,
          entering: !currentIds.has(item.id),
          exiting: false,
        }))
        const exitingDisplay = currentActive
          .filter((entry) => !nextIds.has(entry.item.id))
          .map((entry) => ({
            ...entry,
            entering: false,
            exiting: true,
          }))

        return [...nextDisplay, ...exitingDisplay]
      })
    })

    const timeout = window.setTimeout(() => {
      setDisplayItems((current) => current.filter((entry) => !entry.exiting))
    }, 520)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
    }
  }, [items])

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
          <p className="text-xs font-medium text-muted-foreground">Batch tokens</p>
          <p className="tabular-nums text-sm font-semibold">{formatBatchHeading(currentBatchStatus, aiFallbackUsed)}</p>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {currentBatchStatus
            ? `${currentBatchStatus.inputRows.toLocaleString()} rows in batch, ${currentBatchStatus.aiRows.toLocaleString()} need AI.`
            : "Waiting for the first batch."}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2 border-t pt-2 text-xs text-muted-foreground">
          <BatchMiniStat label="Input tok" value={currentBatchStatus?.tokenUsage?.prompt_tokens} />
          <BatchMiniStat label="Output tok" value={currentBatchStatus?.tokenUsage?.completion_tokens} />
          <BatchMiniStat label="Total tok" value={currentBatchStatus?.tokenUsage?.total_tokens} />
        </div>
        <p className="mt-2 truncate border-t pt-2 text-xs text-muted-foreground">
          {currentBatchStatus
            ? formatModelName(currentBatchStatus.model)
            : tokenUsage
              ? `${tokenUsage.total_tokens.toLocaleString()} total tokens used so far.`
              : "Model pending."}
        </p>

      </div>

      <div
        className="relative overflow-hidden"
        style={{ height: MAX_VISIBLE_ACTIVITY * ACTIVITY_CARD_HEIGHT + (MAX_VISIBLE_ACTIVITY - 1) * ACTIVITY_CARD_GAP }}
      >
        {displayItems.map(({ item, slot, entering, exiting }) => (
          <div
            key={item.id}
            className={cn(
              "absolute inset-x-0 grid grid-cols-[28px_1fr] gap-2 rounded-md border bg-card/70 p-2.5 will-change-transform",
              exiting && "pointer-events-none",
            )}
            style={{
              height: ACTIVITY_CARD_HEIGHT,
              opacity: exiting ? 0 : 1,
              transform: `translateY(${slot * (ACTIVITY_CARD_HEIGHT + ACTIVITY_CARD_GAP)}px)`,
              transitionProperty: "transform, opacity, border-color, background-color",
              transitionDuration: exiting ? "180ms" : "420ms",
              transitionTimingFunction: exiting ? "ease-out" : "cubic-bezier(0.22, 1, 0.36, 1)",
              transitionDelay: exiting ? "0ms" : entering ? "260ms" : "130ms",
              animation: entering ? "activity-card-fade-in 260ms ease-out 260ms both" : "none",
              zIndex: exiting ? 0 : MAX_VISIBLE_ACTIVITY - slot + 1,
            }}
          >
            <div className={cn(
              "mt-0.5 flex size-7 items-center justify-center rounded-md",
              slot === 0 && !exiting ? "bg-primary/10 text-primary ring-1 ring-primary/25" : "bg-muted text-muted-foreground",
            )}>
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

function BatchMiniStat({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="truncate">{label}</p>
      <p className="tabular-nums text-foreground">{formatNullableNumber(value)}</p>
    </div>
  )
}

function formatBatchHeading(status: CurrentBatchStatus | null, aiFallbackUsed: boolean) {
  if (!status) return aiFallbackUsed ? "Fallback" : "Waiting"
  const suffix = status.phase === "sent" ? "sent" : status.phase === "fallback" ? "fallback" : "received"
  return `Batch ${status.batchNo}/${status.totalBatches} ${suffix}`
}

function formatNullableNumber(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "-"
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

function hasUsableTokenUsage(usage: TokenUsage | undefined | null): usage is TokenUsage {
  return Number(usage?.total_tokens ?? 0) > 0
}
