"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { SaveIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api-client"
import { clearGrowEasyDataCache } from "@/lib/client-cache"
import type { CleanedRow } from "@/lib/types"

export function SaveReviewedRowsButton({
  importId,
  rows,
}: {
  importId: string
  rows: CleanedRow[]
}) {
  const [isPending, startTransition] = useTransition()

  async function saveRows() {
    startTransition(async () => {
      const rowsToSave = readReviewDraft(importId) ?? rows

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
        clearGrowEasyDataCache()
        toast.success(`Saved ${data.saved_rows ?? 0} good or fixed rows.`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to save rows.")
      }
    })
  }

  return (
    <Button onClick={saveRows} loading={isPending}>
      <SaveIcon className="size-4" />
      Save good rows
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
