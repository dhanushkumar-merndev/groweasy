"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, EyeIcon, Maximize2Icon, Minimize2Icon } from "lucide-react"
import { toast } from "sonner"

import { EditableCell } from "@/components/editable-cell"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { clearGrowEasyDataCache } from "@/lib/client-cache"
import type { SavedRow, Template } from "@/lib/types"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 50
const META_COLUMNS = "minmax(118px,118px) minmax(64px,64px) minmax(92px,92px)"
const COMPACT_META_COLUMNS = "minmax(74px,0.7fr) minmax(44px,0.35fr) minmax(74px,0.55fr)"
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
const COMPACT_COLUMN_WIDTHS: Record<string, string> = {
  created_at: "minmax(88px,0.85fr)",
  name: "minmax(110px,1.2fr)",
  email: "minmax(150px,1.6fr)",
  country_code: "minmax(76px,0.7fr)",
  mobile_without_country_code: "minmax(138px,1.3fr)",
  company: "minmax(98px,1fr)",
  city: "minmax(90px,0.9fr)",
  state: "minmax(92px,0.95fr)",
}

export function VirtualTable({
  importId,
  rows,
  template,
}: {
  importId: string
  rows: SavedRow[]
  template: Template
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [localRows, setLocalRows] = useState(rows)
  const [page, setPage] = useState(0)
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({})
  const [dirtyRows, setDirtyRows] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState(false)
  const [fullDetails, setFullDetails] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
      setPage(0)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])
  const templateColumns = template.columns_config
  const compactColumnCount = 8
  const columns = fullDetails || templateColumns.length <= compactColumnCount
    ? templateColumns
    : templateColumns.slice(0, compactColumnCount)
  const hiddenColumnCount = Math.max(0, templateColumns.length - columns.length)
  const gridTemplateColumns = useMemo(
    () => {
      if (!fullDetails) {
        return `${COMPACT_META_COLUMNS} ${columns
          .map((column) => COMPACT_COLUMN_WIDTHS[column.key] ?? "minmax(96px,1fr)")
          .join(" ")}`
      }

      return `${META_COLUMNS} ${columns
        .map((column) => CLEANED_COLUMN_WIDTHS[column.key] ?? "minmax(170px,170px)")
        .join(" ")}`
    },
    [columns, fullDetails],
  )
  const suggestions = useMemo(() => {
    const values: Record<string, Set<string>> = {}

    for (const row of localRows) {
      for (const column of columns) {
        const value = String(row.cleaned_data[column.key] ?? "").trim()

        if (!value) {
          continue
        }

        values[column.key] ??= new Set()
        values[column.key].add(value)
      }
    }

    return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, [...value].slice(0, 20)]))
  }, [columns, localRows])
  const filteredRows = useMemo(
    () =>
      localRows.filter((row) =>
        debouncedQuery
          ? `${row.sheet_name} ${row.row_index} ${JSON.stringify(row.cleaned_data)}`
              .toLowerCase()
              .includes(debouncedQuery.toLowerCase())
          : true
      ),
    [localRows, debouncedQuery]
  )
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageStart = currentPage * PAGE_SIZE
  const pageEnd = Math.min(pageStart + PAGE_SIZE, filteredRows.length)
  const pageRows = useMemo(() => filteredRows.slice(pageStart, pageEnd), [filteredRows, pageEnd, pageStart])
  const rowVirtualizer = useVirtualizer({
    count: pageRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 12,
  })
  const canPreviousPage = currentPage > 0
  const canNextPage = currentPage < pageCount - 1

  function updateCell(rowId: string, key: string, value: string) {
    setLocalRows((current) =>
      current.map((row) =>
        row.id === rowId ? { ...row, cleaned_data: { ...row.cleaned_data, [key]: value } } : row
      )
    )
    setDirtyRows((current) => ({ ...current, [rowId]: true }))
  }

  async function saveRow(row: SavedRow) {
    if (!dirtyRows[row.id]) {
      return
    }

    setSavingRows((current) => ({ ...current, [row.id]: true }))
    const response = await api(`/tables/${row.import_id || importId}/rows/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cleaned_data: row.cleaned_data }),
    })
    setSavingRows((current) => ({ ...current, [row.id]: false }))

    if (response.ok) {
      setDirtyRows((current) => ({ ...current, [row.id]: false }))
      clearGrowEasyDataCache()
      toast.success("Row saved.")
    } else {
      toast.error("Unable to save row.")
    }
  }

  function goToPage(nextPage: number) {
    setPage(Math.min(Math.max(nextPage, 0), pageCount - 1))
    parentRef.current?.scrollTo({ top: 0, left: parentRef.current.scrollLeft })
  }

  async function exportTemplateExcel() {
    const ExcelJS = await import("exceljs")
    const headers = columns.map((column) => column.export_title || column.label)
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet("Saved Rows")

    worksheet.addRow(headers)
    localRows.forEach((row) => {
      worksheet.addRow(columns.map((column) => sanitizeExportValue(row.cleaned_data[column.key])))
    })
    worksheet.getRow(1).font = { bold: true }

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${template.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "template"}-rows.xlsx`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className={cn(
        "grid gap-3",
        expanded && "fixed inset-3 z-50 grid-rows-[auto_minmax(0,1fr)] rounded-xl border bg-background p-3 shadow-2xl"
      )}
    >
      <div className="flex items-center gap-2">
        <Input
          value={query}
          placeholder="Search saved rows"
          onChange={(event) => {
            setQuery(event.target.value)
            setPage(0)
          }}
        />
        {templateColumns.length > compactColumnCount ? (
          <Button variant={fullDetails ? "secondary" : "outline"} onClick={() => setFullDetails((current) => !current)}>
            <EyeIcon />
            {fullDetails ? "Template view" : "Full details"}
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => void exportTemplateExcel()} disabled={localRows.length === 0}>
          <DownloadIcon />
          Export
        </Button>
        <Button size="icon" variant="outline" onClick={() => setExpanded((current) => !current)}>
          {expanded ? <Minimize2Icon /> : <Maximize2Icon />}
          <span className="sr-only">{expanded ? "Collapse table" : "Expand table"}</span>
        </Button>
      </div>
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
        <div
          ref={parentRef}
          className={cn(
            "raw-preview-scroll overflow-auto",
            expanded ? "min-h-0 flex-1" : "max-h-[clamp(360px,calc(100vh-315px),680px)]"
          )}
        >
          <div className={fullDetails ? "min-w-max" : "min-w-0"}>
            <div
              className="sticky top-0 z-10 grid border-b bg-muted text-sm font-medium text-foreground"
              style={{ gridTemplateColumns }}
            >
              <GridCell head>Sheet</GridCell>
              <GridCell head>Row</GridCell>
              <GridCell head>Save</GridCell>
              {columns.map((column) => (
                <GridCell key={column.key} head>
                  {column.label}
                </GridCell>
              ))}
            </div>
            {!fullDetails && hiddenColumnCount > 0 ? (
              <div className="border-b bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
                Template view showing {columns.length} key fields. {hiddenColumnCount} more fields hidden.
              </div>
            ) : null}
            <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = pageRows[virtualRow.index]

              return (
                <div
                  key={row.id}
                  className="absolute left-0 right-0 grid min-h-9 border-b bg-[color-mix(in_oklch,var(--primary),transparent_96%)] text-sm transition-colors hover:bg-muted/45"
                  style={{ gridTemplateColumns, transform: `translateY(${virtualRow.start}px)` }}
                >
                  <GridCell title={row.sheet_name}>{row.sheet_name}</GridCell>
                  <GridCell>{row.row_index}</GridCell>
                  <GridCell>
                    <Button
                      size="xs"
                      variant={dirtyRows[row.id] ? "default" : "outline"}
                      loading={savingRows[row.id]}
                      disabled={!dirtyRows[row.id]}
                      onClick={() => void saveRow(row)}
                    >
                      Save
                    </Button>
                  </GridCell>
                  {columns.map((column) => (
                    <GridCell key={column.key}>
                      <EditableCell
                        value={row.cleaned_data[column.key] ?? ""}
                        suggestions={suggestions[column.key]}
                        onChange={(value) => updateCell(row.id, column.key, value)}
                      />
                    </GridCell>
                  ))}
                </div>
              )
            })}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t bg-muted/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{filteredRows.length ? pageStart + 1 : 0}</span>-
            <span className="font-medium text-foreground">{pageEnd}</span> of{" "}
            <span className="font-medium text-foreground">{filteredRows.length}</span> rows
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
    </div>
  )
}

function GridCell({ children, head = false, title }: { children: React.ReactNode; head?: boolean; title?: string }) {
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

function sanitizeExportValue(value: SavedRow["cleaned_data"][string]) {
  if (typeof value === "string" && /^([=+@]|-[A-Za-z(])/.test(value.trim())) {
    return `'${value}`
  }

  return value ?? ""
}
