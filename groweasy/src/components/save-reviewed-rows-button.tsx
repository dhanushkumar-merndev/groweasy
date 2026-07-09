"use client"

import { useState } from "react"
import { toast } from "sonner"
import { SaveIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api-client"
import type { CleanedRow } from "@/lib/types"

export function SaveReviewedRowsButton({
  importId,
  rows,
}: {
  importId: string
  rows: CleanedRow[]
}) {
  const [pending, setPending] = useState(false)

  async function saveRows() {
    const rowsToSave = readReviewDraft(importId) ?? rows
    setPending(true)

    try {
      const response = await api(`/imports/${importId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rowsToSave }),
      })
      const data = (await response.json()) as { saved_rows?: number; error?: { message?: string } }

      if (!response.ok) {
        throw new Error(data.error?.message ?? "Unable to save rows.")
      }

      window.sessionStorage.removeItem(reviewDraftKey(importId))
      toast.success(`Saved ${data.saved_rows ?? 0} good or fixed rows.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save rows.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Button onClick={saveRows} disabled={pending}>
      <SaveIcon className="size-4" />
      {pending ? "Saving..." : "Save good rows"}
    </Button>
  )
}

function reviewDraftKey(importId: string) {
  return `groweasy-review-draft:${importId}`
}

function readReviewDraft(importId: string) {
  const rawDraft = window.sessionStorage.getItem(reviewDraftKey(importId))

  if (!rawDraft) {
    return null
  }

  try {
    return JSON.parse(rawDraft) as CleanedRow[]
  } catch {
    window.sessionStorage.removeItem(reviewDraftKey(importId))
    return null
  }
}
