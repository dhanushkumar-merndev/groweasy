"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react"

import { DataGrid } from "@/components/data-grid"
import { StatusCountCards } from "@/components/status-count-cards"
import { Button } from "@/components/ui/button"
import { getMissingFieldsForTemplate } from "@/lib/formatting"
import type { CleanedRow, Template } from "@/lib/types"

export function ReviewWorkspace({
  importId,
  rows,
  template,
  requireBothEmailPhone = false,
}: {
  importId: string
  rows: CleanedRow[]
  template: Template
  requireBothEmailPhone?: boolean
}) {
  const sourceSignature = useMemo(() => getRowsSignature(rows), [rows])
  const [draftRows, setDraftRows] = useState(() => readReviewDraft(importId, sourceSignature) ?? rows)
  const editableRows = useMemo(
    () => normalizeReviewRows(draftRows, template, { requireBothEmailPhone }),
    [draftRows, requireBothEmailPhone, template],
  )
  const summary = useMemo(() => summarizeReviewRows(editableRows), [editableRows])

  useEffect(() => {
    setDraftRows(readReviewDraft(importId, sourceSignature) ?? rows)
  }, [importId, rows, sourceSignature])

  useEffect(() => {
    try {
      window.sessionStorage.setItem(reviewDraftKey(importId), JSON.stringify({
        signature: sourceSignature,
        rows: editableRows,
      }))
    } catch {
      // Best-effort draft only. The backend remains the source of truth.
    }
  }, [editableRows, importId, sourceSignature])

  return (
    <div className="grid min-w-0 gap-4">
      <StatusCountCards summary={summary} />
      <DataGrid
        rows={editableRows}
        template={template}
        requireBothEmailPhone={requireBothEmailPhone}
        onRowsChange={setDraftRows}
      />
    </div>
  )
}

function normalizeReviewRows(
  rows: CleanedRow[],
  template: Template,
  options: { requireBothEmailPhone?: boolean } = {},
) {
  return rows.map((row) => {
    if (row.status === "skipped") {
      return row
    }

    const missingFields = getMissingFieldsForTemplate(template, row.cleaned_data, options)

    return {
      ...row,
      status: missingFields.length > 0 ? "missing" as const : "good" as const,
      missing_fields: missingFields,
    }
  })
}

function summarizeReviewRows(rows: CleanedRow[]) {
  return {
    good_count: rows.filter((row) => row.status === "good").length,
    missing_count: rows.filter((row) => row.status === "missing").length,
    skipped_count: rows.filter((row) => row.status === "skipped").length,
    ai_changed_count: rows.reduce((total, row) => total + row.ai_changes.length, 0),
  }
}

export function ReviewNav({ importId }: { importId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleNext = useCallback(() => {
    setLoading(true)
    setTimeout(() => router.push(`/upload/${importId}/export`), 300)
  }, [importId, router])

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
      <Button size="sm" disabled={loading} onClick={handleNext}>
        {loading ? (
          <>
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          </>
        ) : (
          <>
            Next
            <ArrowRightIcon className="size-4" />
          </>
        )}
      </Button>
    </div>
  )
}

function reviewDraftKey(importId: string) {
  return `groweasy-review-draft:${importId}`
}

function readReviewDraft(importId: string, sourceSignature: string) {
  if (typeof window === "undefined") {
    return null
  }

  const rawDraft = window.sessionStorage.getItem(reviewDraftKey(importId))

  if (!rawDraft) {
    return null
  }

  try {
    const draft = JSON.parse(rawDraft) as { signature?: string; rows?: CleanedRow[] } | CleanedRow[]

    if (Array.isArray(draft)) {
      window.sessionStorage.removeItem(reviewDraftKey(importId))
      return null
    }

    return draft.signature === sourceSignature && Array.isArray(draft.rows) ? draft.rows : null
  } catch {
    window.sessionStorage.removeItem(reviewDraftKey(importId))
    return null
  }
}

function getRowsSignature(rows: CleanedRow[]) {
  return rows
    .map((row) => `${row.id}:${row.status}:${row.ai_changes.length}:${JSON.stringify(row.cleaned_data)}`)
    .join("|")
}
