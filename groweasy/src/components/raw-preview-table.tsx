"use client"

import { useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { AlertTriangleIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { RawImportRow, ValidationWarning } from "@/lib/types"

const PAGE_SIZE = 50

export function RawPreviewTable({ rows }: { rows: RawImportRow[] }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const columns = useMemo(() => Object.keys(rows[0]?.raw_data ?? {}).slice(0, 12), [rows])
  const gridTemplateColumns = useMemo(
    () => `minmax(160px, 0.8fr) 64px repeat(${columns.length}, minmax(176px, 1fr))`,
    [columns.length],
  )
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageStart = currentPage * PAGE_SIZE
  const pageEnd = Math.min(pageStart + PAGE_SIZE, rows.length)
  const pageRows = useMemo(() => rows.slice(pageStart, pageEnd), [pageEnd, pageStart, rows])
  const rowVirtualizer = useVirtualizer({
    count: pageRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 38,
    overscan: 12,
  })
  const canPreviousPage = currentPage > 0
  const canNextPage = currentPage < pageCount - 1

  function goToPage(nextPage: number) {
    setPage(Math.min(Math.max(nextPage, 0), pageCount - 1))
    parentRef.current?.scrollTo({ top: 0, left: parentRef.current.scrollLeft })
  }

  if (rows.length === 0) {
    return <p className="rounded-lg border p-4 text-sm text-muted-foreground">No usable rows found.</p>
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div ref={parentRef} className="raw-preview-scroll h-[clamp(360px,calc(100vh-220px),760px)] overflow-auto">
        <div className="min-w-max">
          <div
            className="sticky top-0 z-10 grid border-b bg-muted text-sm font-medium text-foreground"
            style={{ gridTemplateColumns }}
          >
            <PreviewCell head>Sheet</PreviewCell>
            <PreviewCell head>Row</PreviewCell>
            {columns.map((column) => (
              <PreviewCell key={column} head>
                {column}
              </PreviewCell>
            ))}
          </div>
          <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = pageRows[virtualRow.index]

              return (
                <div
                  key={row.id}
                  className="absolute left-0 right-0 grid border-b text-sm transition-colors hover:bg-muted/50"
                  style={{
                    gridTemplateColumns,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <PreviewCell>{row.sheet_name}</PreviewCell>
                  <PreviewCell>{row.row_index}</PreviewCell>
                  {columns.map((column) => (
                    <PreviewCell key={column}>{String(row.raw_data[column] ?? "")}</PreviewCell>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t bg-muted/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Showing <span className="font-medium text-foreground">{pageStart + 1}</span>-
          <span className="font-medium text-foreground">{pageEnd}</span> of{" "}
          <span className="font-medium text-foreground">{rows.length}</span> rows
        </p>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <span className="text-xs text-muted-foreground">
            Page {currentPage + 1} of {pageCount}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage - 1)}
              disabled={!canPreviousPage}
            >
              <ChevronLeftIcon className="size-4" />
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage + 1)}
              disabled={!canNextPage}
            >
              Next
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewCell({
  children,
  head = false,
}: {
  children: React.ReactNode
  head?: boolean
}) {
  return (
    <div
      className={cn(
        "min-w-0 truncate px-2 py-2.5",
        head && "h-10 py-2.5",
      )}
      title={typeof children === "string" || typeof children === "number" ? String(children) : undefined}
    >
      {children}
    </div>
  )
}

export function ValidationWarnings({ warnings }: { warnings: ValidationWarning[] }) {
  if (warnings.length === 0) {
    return null
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {warnings.map((warning) => (
        <div key={`${warning.code}-${warning.message}`} className="flex items-start gap-3 rounded-lg border p-3">
          <AlertTriangleIcon className="mt-0.5 size-4 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{warning.message}</p>
            <Badge variant="outline" className="mt-1">
              {warning.count}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  )
}
