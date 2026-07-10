"use client"

import { useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { AiChangeBadge } from "@/components/ai-change-badge"
import { EditableCell } from "@/components/editable-cell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { CleanedRow, RowData, RowStatus, Template } from "@/lib/types"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 50

const tabs: Array<{ value: "raw" | RowStatus | "ai"; label: string }> = [
  { value: "raw", label: "Raw" },
  { value: "good", label: "Good" },
  { value: "missing", label: "Missing" },
  { value: "skipped", label: "Skipped" },
  { value: "ai", label: "AI Changes" },
]

const META_COLUMNS = "minmax(118px,118px) minmax(48px,48px) minmax(76px,76px)"
const AI_COLUMN = "minmax(118px,118px)"
const CLEANED_COLUMN_WIDTHS: Record<string, string> = {
  created_at: "minmax(140px,140px)",
  name: "minmax(200px,200px)",
  email: "minmax(240px,240px)",
  country_code: "minmax(130px,130px)",
  mobile_without_country_code: "minmax(220px,220px)",
  company: "minmax(170px,170px)",
  city: "minmax(150px,150px)",
  state: "minmax(150px,150px)",
  country: "minmax(180px,180px)",
  lead_owner: "minmax(150px,150px)",
  crm_status: "minmax(170px,170px)",
  crm_note: "minmax(240px,240px)",
  data_source: "minmax(170px,170px)",
  possession_time: "minmax(170px,170px)",
  description: "minmax(260px,260px)",
}

export function DataGrid({
  rows,
  template,
  onRowsChange,
}: {
  rows: CleanedRow[]
  template: Template
  onRowsChange?: (rows: CleanedRow[]) => void
}) {
  const suggestions = useMemo(() => buildSuggestions(rows), [rows])

  function updateCell(rowId: string, key: string, value: string) {
    const nextRows: CleanedRow[] = rows.map((row) => {
      if (row.id !== rowId) {
        return row
      }

      const cleaned_data: RowData = { ...row.cleaned_data, [key]: value }
      const missing_fields = template.columns_config
        .filter((column) => column.required && !String(cleaned_data[column.key] ?? "").trim())
        .map((column) => column.key)
      const status: RowStatus = missing_fields.length > 0 ? "missing" : "good"

      return {
        ...row,
        cleaned_data,
        missing_fields,
        status,
      }
    })
    onRowsChange?.(nextRows)
  }

  return (
    <Tabs defaultValue="good" className="grid min-w-0 gap-4">
      <TabsList className="grid h-auto w-full min-w-0 grid-cols-5 overflow-hidden">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="min-w-0 px-2">
            <span className="truncate">{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="raw" className="min-w-0">
        <RowsTable rows={rows} columns={Object.keys(rows[0]?.raw_data ?? {})} mode="raw" />
      </TabsContent>
      {(["good", "missing"] as RowStatus[]).map((status) => (
        <TabsContent key={status} value={status} className="min-w-0">
          <RowsTable
            rows={rows.filter((row) => row.status === status)}
            columns={template.columns_config.map((column) => column.key)}
            mode="cleaned"
            template={template}
            suggestions={suggestions}
            onChange={updateCell}
          />
        </TabsContent>
      ))}
      <TabsContent value="skipped" className="min-w-0">
        <SkippedSummary rows={rows.filter((row) => row.status === "skipped")} />
      </TabsContent>
      <TabsContent value="ai" className="min-w-0">
        <AiChangesTable rows={rows} />
      </TabsContent>
    </Tabs>
  )
}

function RowsTable({
  rows,
  columns,
  mode,
  template,
  suggestions,
  onChange,
}: {
  rows: CleanedRow[]
  columns: string[]
  mode: "raw" | "cleaned"
  template?: Template
  suggestions?: Record<string, string[]>
  onChange?: (rowId: string, key: string, value: string) => void
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const gridTemplateColumns = useMemo(() => {
    const dataColumns =
      mode === "cleaned"
        ? columns.map((column) => CLEANED_COLUMN_WIDTHS[column] ?? "minmax(170px,170px)")
        : columns.map(() => "minmax(180px,180px)")

    return `${META_COLUMNS} ${dataColumns.join(" ")} ${AI_COLUMN}`
  }, [columns, mode])
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageStart = currentPage * PAGE_SIZE
  const pageEnd = Math.min(pageStart + PAGE_SIZE, rows.length)
  const pageRows = useMemo(() => rows.slice(pageStart, pageEnd), [pageEnd, pageStart, rows])
  const rowVirtualizer = useVirtualizer({
    count: pageRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 12,
  })
  const canPreviousPage = currentPage > 0
  const canNextPage = currentPage < pageCount - 1

  function goToPage(nextPage: number) {
    setPage(Math.min(Math.max(nextPage, 0), pageCount - 1))
    parentRef.current?.scrollTo({ top: 0, left: parentRef.current.scrollLeft })
  }

  if (rows.length === 0) return null

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div ref={parentRef} className="raw-preview-scroll max-h-[clamp(320px,calc(100vh-360px),620px)] overflow-auto">
        <div className="min-w-max">
          <div
            className="sticky top-0 z-10 grid border-b bg-muted text-sm font-medium text-foreground"
            style={{ gridTemplateColumns }}
          >
            <Cell head>Sheet</Cell>
            <Cell head>Row</Cell>
            <Cell head>Status</Cell>
            {columns.map((column) => (
              <Cell key={column} head>
                {template?.columns_config.find((item) => item.key === column)?.label ?? column}
              </Cell>
            ))}
            <Cell head>AI</Cell>
          </div>
          <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = pageRows[virtualRow.index]

              return (
                <div
                  key={row.id}
                  className={cn(
                    "absolute left-0 right-0 grid min-h-9 border-b text-sm transition-colors hover:bg-muted/45",
                    row.status === "good" && "bg-[color-mix(in_oklch,var(--primary),transparent_94%)]",
                    row.status === "skipped" && "opacity-60",
                  )}
                  style={{
                    gridTemplateColumns,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <Cell title={row.sheet_name}>{row.sheet_name}</Cell>
                  <Cell>{row.row_index}</Cell>
                  <Cell>
                    <Badge variant={row.status === "missing" ? "destructive" : "outline"}>{row.status}</Badge>
                  </Cell>
                  {columns.map((column) => {
                    const source: RowData = mode === "raw" ? row.raw_data : row.cleaned_data
                    const changed = row.ai_changes.some((change) => change.field === column)
                    const invalid = row.missing_fields.includes(column)

                    return (
                      <Cell key={column}>
                        {mode === "cleaned" ? (
                          <EditableCell
                            value={source[column] ?? ""}
                            suggestions={suggestions?.[column]}
                            invalid={invalid}
                            changed={changed}
                            onChange={(value) => onChange?.(row.id, column, value)}
                          />
                        ) : (
                          <span className="block truncate" title={String(source[column] ?? "")}>
                            {String(source[column] ?? "")}
                          </span>
                        )}
                      </Cell>
                    )
                  })}
                  <Cell>
                    <AiChangeBadge count={row.ai_changes.length} />
                  </Cell>
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

function Cell({ children, head = false, title }: { children: React.ReactNode; head?: boolean; title?: string }) {
  const primitiveContent = typeof children === "string" || typeof children === "number"

  return (
    <div
      className={cn(
        "flex min-w-0 items-center overflow-hidden whitespace-nowrap border-r border-border/45 px-2 last:border-r-0",
        head ? "h-10 py-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground" : "h-9 py-1.5",
      )}
      title={title ?? (primitiveContent ? String(children) : undefined)}
    >
      {primitiveContent ? <span className="block min-w-0 truncate">{children}</span> : children}
    </div>
  )
}

function SkippedSummary({ rows }: { rows: CleanedRow[] }) {
  const reasons = rows.reduce<Record<string, number>>((accumulator, row) => {
    const reason = row.skip_reason ?? "Skipped"
    accumulator[reason] = (accumulator[reason] ?? 0) + 1

    return accumulator
  }, {})

  return (
    <div className="grid gap-2">
      {Object.entries(reasons).map(([reason, count]) => (
        <div key={reason} className="flex items-center justify-between rounded-lg border p-3">
          <span className="text-sm">{reason}</span>
          <Badge variant="outline">{count}</Badge>
        </div>
      ))}
    </div>
  )
}

function AiChangesTable({ rows }: { rows: CleanedRow[] }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const changes = useMemo(
    () =>
      rows.flatMap((row) =>
        row.ai_changes.map((change) => ({
          ...change,
          sheet_name: row.sheet_name,
          row_index: row.row_index,
        }))
      ),
    [rows],
  )
  const gridTemplateColumns = "minmax(140px, 0.8fr) 56px minmax(120px, 1fr) minmax(140px, 1fr) minmax(140px, 1fr) minmax(200px, 1.5fr)"
  const pageCount = Math.max(1, Math.ceil(changes.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageStart = currentPage * PAGE_SIZE
  const pageEnd = Math.min(pageStart + PAGE_SIZE, changes.length)
  const pageChanges = useMemo(() => changes.slice(pageStart, pageEnd), [changes, pageEnd, pageStart])
  const rowVirtualizer = useVirtualizer({
    count: pageChanges.length,
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

  if (changes.length === 0) return null

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div ref={parentRef} className="raw-preview-scroll max-h-[clamp(320px,calc(100vh-360px),620px)] overflow-auto">
        <div className="min-w-max">
          <div
            className="sticky top-0 z-10 grid border-b bg-muted text-sm font-medium text-foreground"
            style={{ gridTemplateColumns }}
          >
            <Cell head>Sheet</Cell>
            <Cell head>Row</Cell>
            <Cell head>Field</Cell>
            <Cell head>Before</Cell>
            <Cell head>After</Cell>
            <Cell head>Reason</Cell>
          </div>
          <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const change = pageChanges[virtualRow.index]

              return (
                <div
                  key={`${change.sheet_name}-${change.row_index}-${change.field}-${virtualRow.index}`}
                  className="absolute left-0 right-0 grid border-b text-sm transition-colors hover:bg-muted/50"
                  style={{
                    gridTemplateColumns,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <Cell title={change.sheet_name}>{change.sheet_name}</Cell>
                  <Cell>{change.row_index}</Cell>
                  <Cell title={change.field}>{change.field}</Cell>
                  <Cell title={String(change.before ?? "")}>{change.before ?? ""}</Cell>
                  <Cell title={String(change.after ?? "")}>{change.after ?? ""}</Cell>
                  <Cell title={change.reason}>{change.reason}</Cell>
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
          <span className="font-medium text-foreground">{changes.length}</span> changes
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

function buildSuggestions(rows: CleanedRow[]) {
  const suggestions: Record<string, Set<string>> = {}

  for (const row of rows) {
    for (const [key, value] of Object.entries(row.cleaned_data)) {
      const text = String(value ?? "").trim()

      if (!text) {
        continue
      }

      suggestions[key] ??= new Set()
      suggestions[key].add(text)
    }
  }

  return Object.fromEntries(
    Object.entries(suggestions).map(([key, values]) => [key, [...values].slice(0, 20)])
  )
}
