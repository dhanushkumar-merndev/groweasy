"use client"

import { useMemo, useState } from "react"
import ExcelJS from "exceljs"
import { TrashIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { Template } from "@/lib/types"

type CleanedValue = string | number | boolean | null | undefined
type CleanedData = Record<string, CleanedValue>

type AiChange = {
  field: string
  before: CleanedValue
  after: CleanedValue
  reason: string
}

type CleanBatchRow = {
  source_sheet: string
  source_sheet_index: number
  source_row_index: number
  status: "good" | "missing" | "skipped"
  missing_fields: string[]
  skip_reason?: string
  cleaned_data: CleanedData
  ai_changes: AiChange[]
}

export type CleanBatchResponse = {
  batch_id: string
  good_rows: CleanBatchRow[]
  missing_rows: CleanBatchRow[]
  skipped_rows: CleanBatchRow[]
  summary: {
    total_input_rows: number
    good_count: number
    missing_count: number
    skipped_count: number
    ai_changed_row_count: number
    ai_changed_cell_count: number
    missing_by_field: Record<string, number>
    skipped_by_reason: Record<string, number>
  }
  error?: {
    message: string
  }
}

function getRowIdentity(row: CleanBatchRow) {
  return `${row.source_sheet}-${row.source_sheet_index}-${row.source_row_index}`
}

export function CleanBatchResultView({ result, template }: { result: CleanBatchResponse, template: Template }) {
  const [editedData, setEditedData] = useState<Record<string, CleanedData>>({})
  const [ignoredRows, setIgnoredRows] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState("all")
  const [page, setPage] = useState(0)
  const pageSize = 100

  const allRawRows = useMemo(() => {
    return [...result.good_rows, ...result.missing_rows, ...result.skipped_rows].sort((left, right) => {
      if (left.source_sheet !== right.source_sheet) {
        return left.source_sheet.localeCompare(right.source_sheet)
      }
      if (left.source_sheet_index !== right.source_sheet_index) {
        return left.source_sheet_index - right.source_sheet_index
      }
      return left.source_row_index - right.source_row_index
    })
  }, [result])

  const computedRows = useMemo(() => {
    return allRawRows
      .filter((r) => !ignoredRows.has(getRowIdentity(r)))
      .map((row) => {
        const id = getRowIdentity(row)
        if (!editedData[id]) return row

        const mergedData = { ...row.cleaned_data, ...editedData[id] }
        const missing = template.columns_config
          .filter((c) => c.required && !String(mergedData[c.key] || "").trim())
          .map((c) => c.key)

        let newStatus = row.status
        if (newStatus === "missing" && missing.length === 0) {
          newStatus = "good"
        }

        return {
          ...row,
          cleaned_data: mergedData,
          status: newStatus,
          missing_fields: missing,
        } as CleanBatchRow
      })
  }, [allRawRows, editedData, ignoredRows, template])

  const filteredRows = useMemo(() => {
    if (activeTab === "good") return computedRows.filter((r) => r.status === "good")
    if (activeTab === "missing") return computedRows.filter((r) => r.status === "missing")
    if (activeTab === "skipped") return computedRows.filter((r) => r.status === "skipped")
    return computedRows
  }, [computedRows, activeTab])

  const paginatedRows = useMemo(() => {
    return filteredRows.slice(page * pageSize, (page + 1) * pageSize)
  }, [filteredRows, page])

  const totalPages = Math.ceil(filteredRows.length / pageSize)

  const handleEdit = (row: CleanBatchRow, field: string, value: string) => {
    const id = getRowIdentity(row)
    setEditedData((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value,
      },
    }))
  }

  const handleIgnore = (row: CleanBatchRow) => {
    setIgnoredRows((prev) => {
      const next = new Set(prev)
      next.add(getRowIdentity(row))
      return next
    })
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    setPage(0)
  }

  const exportToExcel = async (mode: string) => {
    const workbook = new ExcelJS.Workbook()
    const formatRows = (rows: CleanBatchRow[]) => rows.map(r => ({
      "File Row": r.source_row_index,
      "Sheet": r.source_sheet,
      "Status": r.status,
      "Missing Fields": r.missing_fields.join(", "),
      ...r.cleaned_data
    }))

    if (mode === "all_tabs" || mode === "all") {
      appendJsonSheet(workbook, "All Rows", formatRows(computedRows))
    }
    if (mode === "all_tabs" || mode === "good") {
      appendJsonSheet(workbook, "Good Rows", formatRows(computedRows.filter(r => r.status === "good")))
    }
    if (mode === "all_tabs" || mode === "missing") {
      appendJsonSheet(workbook, "Missing Rows", formatRows(computedRows.filter(r => r.status === "missing")))
    }
    if (mode === "all_tabs" || mode === "skipped") {
      appendJsonSheet(workbook, "Skipped Rows", formatRows(computedRows.filter(r => r.status === "skipped")))
    }
    if (mode === "all_tabs" || mode === "ai_changes") {
      const changes = computedRows.flatMap(r => r.ai_changes.map(c => ({
        "File Row": r.source_row_index,
        "Field": c.field,
        "Before": c.before,
        "After": c.after,
        "Reason": c.reason
      })))
      appendJsonSheet(workbook, "AI Changes", changes)
    }
    if (mode === "all_tabs" || mode === "summary") {
      const summaryData = [
        { Metric: "Total Input Rows", Value: result.summary.total_input_rows },
        { Metric: "Good Rows", Value: computedRows.filter(r => r.status === "good").length },
        { Metric: "Missing Rows", Value: computedRows.filter(r => r.status === "missing").length },
        { Metric: "Skipped Rows", Value: computedRows.filter(r => r.status === "skipped").length },
      ]
      appendJsonSheet(workbook, "Summary", summaryData)
    }

    const buffer = await workbook.xlsx.writeBuffer()
    downloadWorkbook(buffer, `Cleaned_Batch_${result.batch_id}_${mode}.xlsx`)
  }

  const getCol = (possibleKeys: string[]) => {
    const templateKeys = new Set(template.columns_config.map(c => c.key))
    return possibleKeys.find(k => templateKeys.has(k)) || possibleKeys[0]
  }

  return (
    <div className="grid gap-6 rounded-lg border p-3 bg-card mt-6">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 w-full sm:w-auto">
          <SummaryMetric label="Batch" value={result.batch_id.slice(-8)} />
          <SummaryMetric label="Good" value={computedRows.filter(r => r.status === "good").length} />
          <SummaryMetric label="Missing" value={computedRows.filter(r => r.status === "missing").length} />
          <SummaryMetric label="Skipped" value={computedRows.filter(r => r.status === "skipped").length} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void exportToExcel("all_tabs")}>
            <DownloadIcon className="size-4 mr-2" /> Export All Sheets
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportToExcel(activeTab === "all" ? "all" : activeTab)}>
            <DownloadIcon className="size-4 mr-2" /> Export Current
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full flex-wrap justify-start h-auto">
          <TabsTrigger value="all">All Rows</TabsTrigger>
          <TabsTrigger value="good">Good Rows</TabsTrigger>
          <TabsTrigger value="missing">Missing Rows</TabsTrigger>
          <TabsTrigger value="skipped">Skipped Rows</TabsTrigger>
          <TabsTrigger value="ai_changes">AI Changes</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>

        {["all", "good", "missing", "skipped"].includes(activeTab) && (
          <TabsContent value={activeTab} className="mt-4">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">S.No</TableHead>
                    <TableHead className="whitespace-nowrap">File Row</TableHead>
                    <TableHead className="whitespace-nowrap">Sheet</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap">Missing Fields</TableHead>
                    <TableHead className="whitespace-nowrap">Created At</TableHead>
                    <TableHead className="whitespace-nowrap">Name</TableHead>
                    <TableHead className="whitespace-nowrap">Email</TableHead>
                    <TableHead className="whitespace-nowrap">Country Code</TableHead>
                    <TableHead className="whitespace-nowrap">Mobile</TableHead>
                    <TableHead className="whitespace-nowrap">Project/Source</TableHead>
                    <TableHead className="whitespace-nowrap">Owner</TableHead>
                    <TableHead className="whitespace-nowrap">City</TableHead>
                    <TableHead className="whitespace-nowrap">State</TableHead>
                    <TableHead className="whitespace-nowrap">Country</TableHead>
                    <TableHead className="whitespace-nowrap">Note</TableHead>
                    <TableHead className="whitespace-nowrap">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRows.length > 0 ? (
                    paginatedRows.map((row, index) => (
                      <TableRow 
                        key={getRowIdentity(row)}
                        className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both"
                        style={{ animationDelay: `${index * 30}ms` }}
                      >
                        <TableCell>{page * pageSize + index + 1}</TableCell>
                        <TableCell>{row.source_row_index}</TableCell>
                        <TableCell>{displayValue(row.source_sheet)}</TableCell>
                        <TableCell>{statusLabel(row.status)}</TableCell>
                        <TableCell className="text-destructive max-w-[150px] truncate">
                          {row.missing_fields.length > 0 ? row.missing_fields.join(", ") : "—"}
                        </TableCell>
                        
                        <EditableCell row={row} fieldKey={getCol(["created_at", "date"])} onEdit={handleEdit} />
                        <EditableCell row={row} fieldKey={getCol(["name", "full_name"])} onEdit={handleEdit} />
                        <EditableCell row={row} fieldKey={getCol(["email"])} onEdit={handleEdit} />
                        <EditableCell row={row} fieldKey={getCol(["country_code"])} onEdit={handleEdit} />
                        <EditableCell row={row} fieldKey={getCol(["mobile_without_country_code", "mobile", "phone"])} onEdit={handleEdit} />
                        <EditableCell row={row} fieldKey={getCol(["project_interested", "source", "data_source"])} onEdit={handleEdit} />
                        <EditableCell row={row} fieldKey={getCol(["lead_owner", "owner"])} onEdit={handleEdit} />
                        <EditableCell row={row} fieldKey={getCol(["city"])} onEdit={handleEdit} />
                        <EditableCell row={row} fieldKey={getCol(["state"])} onEdit={handleEdit} />
                        <EditableCell row={row} fieldKey={getCol(["country"])} onEdit={handleEdit} />
                        <EditableCell row={row} fieldKey={getCol(["crm_note", "notes", "description"])} onEdit={handleEdit} />
                        
                        <TableCell>
                          {row.status === "skipped" && (
                            <Button variant="ghost" size="icon" onClick={() => handleIgnore(row)} title="Ignore row">
                              <TrashIcon className="size-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={17} className="text-center">No rows found.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">
                  Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, filteredRows.length)} of {filteredRows.length}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    <ChevronLeftIcon className="size-4" />
                  </Button>
                  <Button variant="outline" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                    <ChevronRightIcon className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        )}

        <TabsContent value="ai_changes" className="mt-4">
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Row</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Before</TableHead>
                  <TableHead>After</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {computedRows.flatMap(r => r.ai_changes.map(c => ({ row: r, change: c }))).map(({ row, change }, index) => (
                  <TableRow key={`${getRowIdentity(row)}-${change.field}-${index}`}>
                    <TableCell>{row.source_row_index}</TableCell>
                    <TableCell>{displayValue(change.field)}</TableCell>
                    <TableCell>{displayValue(change.before)}</TableCell>
                    <TableCell>{displayValue(change.after)}</TableCell>
                    <TableCell>{displayValue(change.reason)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="summary" className="mt-4">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-md border">
              <Table>
                <TableBody>
                  <SummaryRow label="Total Input Rows" value={result.summary.total_input_rows} />
                  <SummaryRow label="Good Rows" value={computedRows.filter(r => r.status === "good").length} />
                  <SummaryRow label="Missing Rows" value={computedRows.filter(r => r.status === "missing").length} />
                  <SummaryRow label="Skipped Rows" value={computedRows.filter(r => r.status === "skipped").length} />
                  <SummaryRow label="AI Changed Rows" value={result.summary.ai_changed_row_count} />
                  <SummaryRow label="AI Changed Cells" value={result.summary.ai_changed_cell_count} />
                </TableBody>
              </Table>
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Missing Field</TableHead>
                    <TableHead>Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(result.summary.missing_by_field).map(([field, count]) => (
                    <TableRow key={field}>
                      <TableCell>{field}</TableCell>
                      <TableCell>{count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function appendJsonSheet(workbook: ExcelJS.Workbook, name: string, rows: Array<Record<string, CleanedValue>>) {
  const worksheet = workbook.addWorksheet(name)
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))]

  worksheet.addRow(headers)
  rows.forEach((row) => {
    worksheet.addRow(headers.map((header) => sanitizeExportValue(row[header])))
  })

  worksheet.getRow(1).font = { bold: true }
}

function sanitizeExportValue(value: CleanedValue) {
  if (typeof value === "string" && /^([=+@]|-[A-Za-z(])/.test(value.trim())) {
    return `'${value}`
  }

  return value ?? ""
}

function downloadWorkbook(buffer: ExcelJS.Buffer, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function EditableCell({ 
  row, 
  fieldKey, 
  onEdit 
}: { 
  row: CleanBatchRow; 
  fieldKey: string; 
  onEdit: (row: CleanBatchRow, field: string, value: string) => void 
}) {
  const isMissing = row.missing_fields.includes(fieldKey)
  
  return (
    <TableCell className="p-1">
      <Input
        value={String(row.cleaned_data[fieldKey] || "")}
        onChange={(e) => onEdit(row, fieldKey, e.target.value)}
        className={`h-8 min-w-[120px] ${isMissing ? "border-destructive focus-visible:ring-destructive" : "border-transparent hover:border-input"}`}
        placeholder={isMissing ? "Required" : "—"}
      />
    </TableCell>
  )
}

function SummaryMetric({ label, value }: { label: string; value: CleanedValue }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{displayValue(value)}</p>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: CleanedValue }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{label}</TableCell>
      <TableCell>{displayValue(value)}</TableCell>
    </TableRow>
  )
}

function displayValue(value: CleanedValue) {
  if (value === null || value === undefined || String(value) === "") {
    return "—"
  }
  return String(value)
}

function statusLabel(status: CleanBatchRow["status"]) {
  switch (status) {
    case "good":
      return <span className="text-green-500 font-medium">✅ Good</span>
    case "missing":
      return <span className="text-orange-500 font-medium">⚠️ Missing</span>
    case "skipped":
      return <span className="text-muted-foreground font-medium">⏭️ Skipped</span>
  }
}
