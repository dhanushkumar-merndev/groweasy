"use client"

import { useMemo, useState } from "react"

import { AiChangeBadge } from "@/components/ai-change-badge"
import { EditableCell } from "@/components/editable-cell"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { CleanedRow, RowData, RowStatus, Template } from "@/lib/types"
import { cn } from "@/lib/utils"

const tabs: Array<{ value: "raw" | RowStatus | "ai"; label: string }> = [
  { value: "raw", label: "Raw" },
  { value: "good", label: "Good" },
  { value: "missing", label: "Missing" },
  { value: "skipped", label: "Skipped Summary" },
  { value: "ai", label: "AI Changes" },
]

export function DataGrid({
  rows,
  template,
  onRowsChange,
}: {
  rows: CleanedRow[]
  template: Template
  onRowsChange?: (rows: CleanedRow[]) => void
}) {
  const [editableRows, setEditableRows] = useState(rows)
  const suggestions = useMemo(() => buildSuggestions(editableRows), [editableRows])

  function updateCell(rowId: string, key: string, value: string) {
    setEditableRows((current) => {
      const nextRows: CleanedRow[] = current.map((row) => {
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

      return nextRows
    })
  }

  return (
    <Tabs defaultValue="good" className="grid gap-4">
      <TabsList className="w-full justify-start overflow-x-auto">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="raw">
        <RowsTable rows={editableRows} columns={Object.keys(editableRows[0]?.raw_data ?? {})} mode="raw" />
      </TabsContent>
      {(["good", "missing"] as RowStatus[]).map((status) => (
        <TabsContent key={status} value={status}>
          <RowsTable
            rows={editableRows.filter((row) => row.status === status)}
            columns={template.columns_config.map((column) => column.key)}
            mode="cleaned"
            template={template}
            suggestions={suggestions}
            onChange={updateCell}
          />
        </TabsContent>
      ))}
      <TabsContent value="skipped">
        <SkippedSummary rows={editableRows.filter((row) => row.status === "skipped")} />
      </TabsContent>
      <TabsContent value="ai">
        <AiChangesTable rows={editableRows} />
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
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="max-h-[620px] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow>
              <TableHead className="min-w-32">Sheet</TableHead>
              <TableHead className="min-w-20">Row</TableHead>
              <TableHead className="min-w-28">Status</TableHead>
              {columns.map((column) => (
                <TableHead key={column} className="min-w-44">
                  {template?.columns_config.find((item) => item.key === column)?.label ?? column}
                </TableHead>
              ))}
              <TableHead className="min-w-32">AI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                className={cn(
                  row.status === "good" && "bg-[color-mix(in_oklch,var(--primary),transparent_94%)]",
                  row.status === "skipped" && "opacity-60"
                )}
              >
                <TableCell>{row.sheet_name}</TableCell>
                <TableCell>{row.row_index}</TableCell>
                <TableCell>
                  <Badge variant={row.status === "missing" ? "destructive" : "outline"}>{row.status}</Badge>
                </TableCell>
                {columns.map((column) => {
                  const source: RowData = mode === "raw" ? row.raw_data : row.cleaned_data
                  const changed = row.ai_changes.some((change) => change.field === column)
                  const invalid = row.missing_fields.includes(column)

                  return (
                    <TableCell key={column}>
                      {mode === "cleaned" ? (
                        <EditableCell
                          value={source[column] ?? ""}
                          suggestions={suggestions?.[column]}
                          invalid={invalid}
                          changed={changed}
                          onChange={(value) => onChange?.(row.id, column, value)}
                        />
                      ) : (
                        <span>{String(source[column] ?? "")}</span>
                      )}
                    </TableCell>
                  )
                })}
                <TableCell>
                  <AiChangeBadge count={row.ai_changes.length} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
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
  const changes = rows.flatMap((row) =>
    row.ai_changes.map((change) => ({
      ...change,
      sheet_name: row.sheet_name,
      row_index: row.row_index,
    }))
  )

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sheet</TableHead>
            <TableHead>Row</TableHead>
            <TableHead>Field</TableHead>
            <TableHead>Before</TableHead>
            <TableHead>After</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {changes.map((change, index) => (
            <TableRow key={`${change.sheet_name}-${change.row_index}-${change.field}-${index}`}>
              <TableCell>{change.sheet_name}</TableCell>
              <TableCell>{change.row_index}</TableCell>
              <TableCell>{change.field}</TableCell>
              <TableCell>{change.before ?? ""}</TableCell>
              <TableCell>{change.after ?? ""}</TableCell>
              <TableCell>{change.reason}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
