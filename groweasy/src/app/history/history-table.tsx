"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { api } from "@/lib/api-client"
import type { HistoryLog } from "@/lib/types"

const PAGE_SIZE = 50

export function HistoryTable({ history }: { history: HistoryLog[] }) {
  const [page, setPage] = useState(0)

  const totalPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE))
  const pageRows = useMemo(
    () => history.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [history, page],
  )

  async function exportImport(importId: string) {
    const response = await api(`/imports/${importId}/export/excel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "all_good" }),
    })

    if (!response.ok) {
      toast.error("Excel export failed.")
      return
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "cleaned-data.xlsx"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader>
        <CardTitle>Activity log</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>Date</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                  No history yet.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium capitalize">{entry.action.replace(/_/g, " ")}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {formatMetaSummary(entry.action, entry.meta)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {entry.import_id && (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" render={<Link href={`/campaigns/${entry.import_id}`} />}>
                          View
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void exportImport(entry.import_id)}>
                          <DownloadIcon className="size-4" />
                          Export
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
      {history.length > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t px-4 py-3">
          <span className="text-sm text-muted-foreground">
            {history.length} total entries
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeftIcon />
            </Button>
            <span className="min-w-20 text-center text-sm tabular-nums">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function formatMetaSummary(action: string, meta: Record<string, unknown>): string {
  if (action === "export_done" || action === "google_sheet_export_done") {
    const rows = meta.rows ?? meta.saved_rows ?? 0
    const modeLabels: Record<string, string> = {
      all_good: "All good rows",
      full: "All rows",
      selected: "Selected rows",
    }
    const mode = modeLabels[String(meta.mode ?? "")] || String(meta.mode ?? "")
    return `${rows} rows exported${mode ? ` (${mode})` : ""}`
  }
  if (action === "rows_saved") {
    const savedRows = Number(meta.saved_rows ?? 0)
    const missingRows = Number(meta.missing_rows ?? 0)
    return `${savedRows.toLocaleString()} rows saved${missingRows ? `, ${missingRows.toLocaleString()} left missing` : ""}`
  }
  const parts: string[] = []
  if (meta.file_name) parts.push(String(meta.file_name))
  if (meta.template_name) parts.push(`Template: ${meta.template_name}`)
  if (meta.import_name) parts.push(String(meta.import_name))
  return parts.join(" · ") || JSON.stringify(meta)
}
