"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react"

import { DataGrid } from "@/components/data-grid"
import { Button } from "@/components/ui/button"
import type { CleanedRow, Template } from "@/lib/types"

export function ReviewWorkspace({
  importId,
  rows,
  template,
}: {
  importId: string
  rows: CleanedRow[]
  template: Template
}) {
  const [editableRows, setEditableRows] = useState(() => readReviewDraft(importId) ?? rows)

  useEffect(() => {
    try {
      window.sessionStorage.setItem(reviewDraftKey(importId), JSON.stringify(editableRows))
    } catch {
      // Best-effort draft only. The backend remains the source of truth.
    }
  }, [editableRows, importId])

  return (
    <div className="grid min-w-0 gap-4">
      <DataGrid rows={editableRows} template={template} onRowsChange={setEditableRows} />
    </div>
  )
}

export function ReviewNav({ importId }: { importId: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground"
        render={<Link href={`/upload/${importId}/process`} />}
      >
        <ArrowLeftIcon className="size-4" />
        Back
      </Button>
      <Button size="sm" render={<Link href={`/upload/${importId}/export`} />}>
        Next
        <ArrowRightIcon className="size-4" />
      </Button>
    </div>
  )
}

function reviewDraftKey(importId: string) {
  return `groweasy-review-draft:${importId}`
}

function readReviewDraft(importId: string) {
  if (typeof window === "undefined") {
    return null
  }

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
