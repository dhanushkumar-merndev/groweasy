"use client"

import { useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, PencilIcon, PlusIcon, SaveIcon, TrashIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { EditableCell } from "@/components/editable-cell"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/lib/api-client"
import { clearGrowEasyDataCache } from "@/lib/client-cache"
import { cn } from "@/lib/utils"
import type { SavedRow } from "@/lib/types"

const PAGE_SIZE = 50

const COLUMN_WIDTHS: Record<string, string> = {
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
}: {
  allRows: SavedRow[]
  allColumns: string[]
  campaigns: Campaign[]
  activeCampaignId: string | null
  onSetActiveCampaign: (id: string | null) => void
  onCreateCampaign: (name: string) => Promise<void>
  onDeleteCampaign: (id: string) => Promise<void>
  onRemoveRowFromCampaign: (campaignId: string, rowId: string) => Promise<void>
  onAddRowToCampaign: (campaignId: string, rowId: string) => Promise<void>
}) {
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

  const columns = allColumns.length > 0 ? allColumns : Object.keys(localRows[0]?.cleaned_data ?? {})

  const totalPages = Math.max(1, Math.ceil(campaignRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const pageStart = currentPage * PAGE_SIZE
  const pageEnd = Math.min(pageStart + PAGE_SIZE, campaignRows.length)
  const pageRows = useMemo(
    () => campaignRows.slice(pageStart, pageEnd),
    [campaignRows, pageStart, pageEnd],
  )

  const rowVirtualizer = useVirtualizer({
    count: pageRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 12,
  })

  const suggestions = useMemo(() => {
    const values: Record<string, Set<string>> = {}
    for (const row of localRows) {
      for (const col of columns) {
        const val = String((row.cleaned_data as Record<string, string>)[col] ?? "").trim()
        if (!val) continue
        values[col] ??= new Set()
        values[col].add(val)
      }
    }
    return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, [...v].slice(0, 20)]))
  }, [localRows, columns])

  const columnWidths = columns.map((col) => COLUMN_WIDTHS[col] ?? "minmax(170px,170px)")
  const META = "minmax(56px,56px)"
  const gridTemplate = `${META} ${columnWidths.join(" ")} minmax(72px,72px)`

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
      clearGrowEasyDataCache()
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

  function goToPage(nextPage: number) {
    setPage(Math.min(Math.max(nextPage, 0), totalPages - 1))
    parentRef.current?.scrollTo({ top: 0, left: parentRef.current.scrollLeft })
  }

  const showAddBar = activeCampaign && availableRows.length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <Tabs
          value={activeCampaignId ?? "all"}
          onValueChange={(v) => onSetActiveCampaign(v === "all" ? null : v)}
        >
          <div className="flex items-center justify-between">
            <TabsList className="h-auto overflow-x-auto">
              <TabsTrigger value="all" className="px-3">
                All <span className="ml-1 text-xs opacity-70">{localRows.length}</span>
              </TabsTrigger>
              {campaigns.map((c) => (
                <TabsTrigger key={c.id} value={c.id} className="px-3">
                  {c.name}
                  <span className="ml-1 text-xs opacity-70">{c.rowIds.length}</span>
                </TabsTrigger>
              ))}
              <TabsTrigger value="__create" className="px-2 text-muted-foreground data-[state=active]:text-foreground">
                <PlusIcon className="size-3.5" />
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-1.5">
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

          <TabsContent value="__create" className="mt-3">
            <Card>
              <CardContent className="flex items-center gap-2 p-4">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Campaign name..."
                  className="h-9"
                  onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
                />
                <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
                  <PlusIcon />
                  Create
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value={activeCampaignId ?? "all"} className="mt-0">
            <div className="overflow-hidden rounded-lg border bg-background">
              {showAddBar && (
                <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
                  <span className="mr-1 text-xs text-muted-foreground">Add rows:</span>
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
              <div ref={parentRef} className="max-h-[clamp(320px,calc(100vh-360px),620px)] overflow-auto">
                {campaignRows.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                    {activeCampaign ? "No rows in this campaign." : "No saved rows yet."}
                  </div>
                ) : (
                  <div className="min-w-max">
                    <div
                      className="sticky top-0 z-10 grid border-b bg-muted text-sm font-medium text-foreground"
                      style={{ gridTemplateColumns: gridTemplate }}
                    >
                      <Cell head>#</Cell>
                      {columns.map((col) => (
                        <Cell key={col} head>{col.replace(/_/g, " ")}</Cell>
                      ))}
                      <Cell head>{"\u00A0"}</Cell>
                    </div>
                    <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const row = pageRows[virtualRow.index]
                        const isEditing = editingRow === row.id
                        const data = row.cleaned_data as Record<string, string>

                        return (
                          <div
                            key={row.id}
                            className="absolute left-0 right-0 grid min-h-9 border-b text-sm transition-colors hover:bg-muted/45"
                            style={{
                              gridTemplateColumns: gridTemplate,
                              transform: `translateY(${virtualRow.start}px)`,
                            }}
                          >
                            <Cell>{virtualRow.index + 1 + pageStart}</Cell>
                            {columns.map((col) => (
                              <Cell key={col}>
                                {isEditing ? (
                                  <EditableCell
                                    value={editValues[col] ?? ""}
                                    suggestions={suggestions[col]}
                                    onChange={(v) => updateCell(col, v)}
                                  />
                                ) : (
                                  <span className="block truncate" title={String(data[col] ?? "")}>
                                    {String(data[col] ?? "")}
                                  </span>
                                )}
                              </Cell>
                            ))}
                            <Cell>
                              <div className="flex justify-end gap-0.5">
                                {isEditing ? (
                                  <>
                                    <Button size="icon" variant="ghost" className="size-7" onClick={() => void saveEdit(row)}>
                                      <SaveIcon className="size-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="size-7" onClick={cancelEdit}>
                                      <XIcon className="size-3.5" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
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
                                  </>
                                )}
                              </div>
                            </Cell>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
              {campaignRows.length > PAGE_SIZE && (
                <div className="flex flex-col gap-2 border-t bg-muted/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    Showing <span className="font-medium text-foreground">{pageStart + 1}</span>-
                    <span className="font-medium text-foreground">{pageEnd}</span> of{" "}
                    <span className="font-medium text-foreground">{campaignRows.length}</span> rows
                  </p>
                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <span className="text-xs text-muted-foreground">
                      Page {currentPage + 1} of {totalPages}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 0}>
                        <ChevronLeftIcon className="size-4" />
                        Previous
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages - 1}>
                        Next
                        <ChevronRightIcon className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
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
