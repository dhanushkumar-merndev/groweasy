"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2Icon, PlayIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { API_BASE } from "@/lib/api-client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

type StreamEvent =
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
    }

export function ProcessingStreamPanel({ importId }: { importId: string }) {
  const [pending, setPending] = useState(false)
  const [percent, setPercent] = useState(0)
  const [status, setStatus] = useState("Ready to process")
  const [counts, setCounts] = useState({
    good: 0,
    missing: 0,
    skipped: 0,
    changed: 0,
  })

  async function startProcessing() {
    setPending(true)
    setPercent(0)
    setStatus("Starting AI batch processing")

    try {
      const response = await fetch(`${API_BASE}/api/imports/${importId}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
        credentials: "include",
      })

      if (!response.ok) {
        const data = (await response.json()) as { error?: { message?: string } }
        throw new Error(data.error?.message ?? "Processing failed.")
      }

      const source = new EventSource(`${API_BASE}/api/imports/${importId}/stream`)

      source.onmessage = (event) => {
        const data = JSON.parse(event.data) as StreamEvent

        if (data.type === "batch_completed") {
          setStatus(`Processing batch ${data.batch_no} / ${data.total_batches}`)
          setCounts({
            good: data.good_count,
            missing: data.missing_count,
            skipped: data.skipped_count,
            changed: data.ai_changed_count,
          })
        }

        if (data.type === "progress") {
          setPercent(data.percent)
        }

        if (data.type === "completed") {
          setPercent(100)
          setStatus("Processing completed")
          setPending(false)
          source.close()
        }
      }

      source.onerror = () => {
        source.close()
        setPending(false)
        toast.error("Network disconnected during SSE stream. Results can still be opened from Review.")
      }
    } catch (error) {
      setPending(false)
      toast.error(error instanceof Error ? error.message : "Processing failed.")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI batch processing</CardTitle>
        <CardDescription>Rows are processed in configurable batches and streamed as each batch completes.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{status}</span>
            <span className="text-sm text-muted-foreground">{percent}%</span>
          </div>
          <Progress value={percent} />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Count label="Good" value={counts.good} />
          <Count label="Missing" value={counts.missing} />
          <Count label="Skipped" value={counts.skipped} />
          <Count label="AI changed" value={counts.changed} />
        </div>
        <Button onClick={startProcessing} disabled={pending} className="w-full sm:w-fit">
          {pending ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
          Start processing
        </Button>
      </CardContent>
    </Card>
  )
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  )
}
