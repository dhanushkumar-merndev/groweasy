"use client"

import { useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { toast } from "sonner"

import { EditableCell } from "@/components/editable-cell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { SavedRow, Template } from "@/lib/types"

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
  const [localRows, setLocalRows] = useState(rows)
  const columns = template.columns_config
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
        query ? JSON.stringify(row.cleaned_data).toLowerCase().includes(query.toLowerCase()) : true
      ),
    [localRows, query]
  )
  const rowVirtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 12,
  })

  function updateCell(rowId: string, key: string, value: string) {
    setLocalRows((current) =>
      current.map((row) =>
        row.id === rowId ? { ...row, cleaned_data: { ...row.cleaned_data, [key]: value } } : row
      )
    )
  }

  async function saveRow(row: SavedRow) {
    const response = await fetch(`/api/tables/${importId}/rows/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cleaned_data: row.cleaned_data }),
    })

    toast[response.ok ? "success" : "error"](response.ok ? "Row saved." : "Unable to save row.")
  }

  return (
    <div className="grid gap-3">
      <Input
        value={query}
        placeholder="Search saved rows"
        onChange={(event) => setQuery(event.target.value)}
      />
      <div ref={parentRef} className="h-[640px] overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow>
              <TableHead className="min-w-40">Sheet</TableHead>
              {columns.map((column) => (
                <TableHead key={column.key} className="min-w-48">
                  {column.label}
                </TableHead>
              ))}
              <TableHead className="min-w-24">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = filteredRows[virtualRow.index]

              return (
                <TableRow
                  key={row.id}
                  className="absolute left-0 right-0 grid"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <TableCell className="min-w-40">{row.sheet_name}</TableCell>
                  {columns.map((column) => (
                    <TableCell key={column.key} className="min-w-48">
                      <EditableCell
                        value={row.cleaned_data[column.key] ?? ""}
                        suggestions={suggestions[column.key]}
                        onChange={(value) => updateCell(row.id, column.key, value)}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="min-w-24">
                    <Button size="sm" variant="outline" onClick={() => void saveRow(row)}>
                      Save
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
