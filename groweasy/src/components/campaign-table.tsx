"use client"

import { useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, PencilIcon, PlusIcon, SaveIcon, TrashIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { EditableCell } from "@/components/editable-cell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import type { SavedRow } from "@/lib/types"

const PAGE_SIZE = 50

const CAMPAIGN_COLUMN_WIDTHS: Record<string, string> = {
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

type Campaign = {
  id: string
  name: string
  rowIds: string[]
}

type CampaignTableProps = {
  allRows: SavedRow[]
  allColumns: string[]
  campaigns: Campaign[]
  activeCampaignId: string | null
  onSetActiveCampaign: (id: string | null) => void
  onCreateCampaign: (name: string) => Promise<void>
  onDeleteCampaign: (id: string) => Promise<void>
  onRemoveRowFromCampaign: (campaignId: string, rowId: string) => Promise<void>
  onAddRowToCampaign: (campaignId: string, rowId: string) => Promise<void>
}

export function CampaignTable({
  allRows,
  allColumns,
  campaigns,
  activeCampaignId,
  onSetActiveCampaign,
  onCreateCampaign,
  onDeleteCampaign,
  onRemoveRowFromCampaign,
  onAddRowToCampaign,
}: CampaignTableProps) {
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  const [editingRow, setEditingRow] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [localRows, setLocalRows] = useState(allRows)
  const [page, setPage] = useState(0)
  const parentRef = useRef<HTMLDivElement>(null)

  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId)
  const campaignRows = useMemo(
    () => (activeCampaign ? localRows.filter((r) => activeCampaign.rowIds.includes(r.id)) : localRows),
    [localRows, activeCampaign],
  )
  const availableRows = useMemo(
    () => (activeCampaign ? localRows.filter((r) => !activeCampaign.rowIds.includes(r.id)) : []),
    [localRows, activeCampaign],
  )

  const columns = allColumns.length > 0 ? allColumns : Object.keys(localRows[0]?.cleaned_data as Record<string, unknown> ?? {})

  const totalPages = Math.max(1, Math.ceil(campaignRows.length / PAGE_SIZE))
  const pageRows = useMemo(
    () => campaignRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [campaignRows, page],
  )

  const rowVirtualizer = useVirtualizer({
    count: pageRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10,
  })

  const suggestions = useMemo(() => {
    const values: Record<string, Set<string>> = {}
    for (const row of localRows) {
      const data = row.cleaned_data as Record<string, string>
      for (const col of columns) {
        const val = String(data[col] ?? "").trim()
        if (!val) continue
        values[col] ??= new Set()
        values[col].add(val)
      }
    }
    return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, [...v].slice(0, 20)]))
  }, [localRows, columns])

  const columnWidths = columns.map(
    (col) => CAMPAIGN_COLUMN_WIDTHS[col] ?? "minmax(160px,1fr)",
  )
  const gridTemplate = `minmax(100px,100px) ${columnWidths.join(" ")} minmax(72px,72px)`

  function startEdit(row: SavedRow) {
    setEditingRow(row.id)
    setEditValues({ ...(row.cleaned_data as Record<string, string>) })
  }

  function cancelEdit() {
    setEditingRow(null)
    setEditValues({})
  }

  function updateCell(key: string, value: string) {
    setEditValues((prev) => ({ ...prev, [key]: value }))
  }

  async function saveEdit(row: SavedRow) {
    const res = await api(`/tables/${row.import_id}/rows/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cleaned_data: editValues }),
    })
    if (res.ok) {
      setLocalRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, cleaned_data: editValues } : r)),
      )
      setEditingRow(null)
      setEditValues({})
      toast.success("Row updated")
    } else {
      toast.error("Failed to save row")
    }
  }

  async function handleExport() {
    const headers = columns.join(",")
    const csvRows = campaignRows.map((row) =>
      columns.map((col) => {
        const val = (row.cleaned_data as Record<string, string>)[col]
        return val != null ? `"${String(val).replace(/"/g, '""')}"` : ""
      }).join(","),
    )
    const csv = [headers, ...csvRows].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${activeCampaign?.name ?? "campaign"}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Campaign exported")
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    await onCreateCampaign(newName.trim())
    setNewName("")
    setCreating(false)
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>Campaigns</CardTitle>
            <div className="flex gap-1">
              {campaigns.map((c) => (
                <Button
                  key={c.id}
                  size="sm"
                  variant={activeCampaignId === c.id ? "default" : "outline"}
                  onClick={() => onSetActiveCampaign(c.id)}
                >
                  {c.name}
                  <span className="ml-1 text-xs opacity-70">{c.rowIds.length}</span>
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New campaign..."
              className="h-8 w-36"
            />
            <Button size="sm" variant="outline" onClick={handleCreate} disabled={creating || !newName.trim()}>
              <PlusIcon />
              Add
            </Button>
            {activeCampaign && (
              <Button size="sm" variant="destructive" onClick={() => onDeleteCampaign(activeCampaign.id)}>
                <TrashIcon />
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleExport} disabled={campaignRows.length === 0}>
              <DownloadIcon />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-0">
        {activeCampaign && availableRows.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b px-4 py-2">
            <span className="text-xs text-muted-foreground">Add rows:</span>
            {availableRows.slice(0, 10).map((r) => {
              const data = r.cleaned_data as Record<string, string>
              return (
                <Button
                  key={r.id}
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs"
                  onClick={() => onAddRowToCampaign(activeCampaign.id, r.id)}
                >
                  {data.name ?? r.id.slice(0, 8)}
                </Button>
              )
            })}
          </div>
        )}
        <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
          {campaignRows.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              {activeCampaign ? "No rows in this campaign." : "No saved rows yet."}
            </div>
          ) : (
            <div
              className="relative grid"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              <div
                className="sticky top-0 z-10 grid border-b bg-background px-4 py-2 text-xs font-medium text-muted-foreground"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <span>Row</span>
                {columns.map((col) => (
                  <span key={col} className="truncate capitalize">{col.replace(/_/g, " ")}</span>
                ))}
                <span />
              </div>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = pageRows[virtualRow.index]
                const isEditing = editingRow === row.id
                const data = row.cleaned_data as Record<string, string>

                return (
                  <div
                    key={row.id}
                    className="absolute left-0 right-0 grid items-center border-b px-4 py-1.5 text-sm transition-colors hover:bg-muted/30"
                    style={{
                      gridTemplateColumns: gridTemplate,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <span className="truncate text-xs text-muted-foreground">
                      {virtualRow.index + 1 + page * PAGE_SIZE}
                    </span>
                    {columns.map((col) => (
                      <div key={col} className="truncate">
                        {isEditing ? (
                          <EditableCell
                            value={editValues[col] ?? ""}
                            suggestions={suggestions[col]}
                            onChange={(v) => updateCell(col, v)}
                          />
                        ) : (
                          <span className="text-sm">{data[col] ?? ""}</span>
                        )}
                      </div>
                    ))}
                    <div className="flex justify-end">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="size-7" onClick={() => void saveEdit(row)}>
                            <SaveIcon className="size-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="size-7" onClick={cancelEdit}>
                            <XIcon className="size-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="size-7" onClick={() => startEdit(row)}>
                            <PencilIcon className="size-3.5" />
                          </Button>
                          {activeCampaign && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7 text-destructive/60 hover:text-destructive"
                              onClick={() => onRemoveRowFromCampaign(activeCampaign.id, row.id)}
                            >
                              <XIcon className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {campaignRows.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="text-sm text-muted-foreground">{campaignRows.length} rows</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeftIcon />
              </Button>
              <span className="min-w-20 text-center text-sm tabular-nums">
                Page {page + 1} of {totalPages}
              </span>
              <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
