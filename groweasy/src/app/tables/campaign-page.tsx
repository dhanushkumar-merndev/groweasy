"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import { CampaignTable } from "@/components/campaign-table"
import { api } from "@/lib/api-client"
import type { SavedRow } from "@/lib/types"

type Campaign = {
  id: string
  name: string
  rowIds: string[]
}

export function CampaignPage({
  initialRows,
  initialColumns,
}: {
  initialRows: SavedRow[]
  initialColumns: string[]
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null)
  const [rows] = useState(initialRows)
  const [columns] = useState(initialColumns)

  useEffect(() => {
    api("/campaigns")
      .then((r) => r.json())
      .then((data) => {
        if (data.data?.campaigns) {
          setCampaigns(data.data.campaigns)
        }
      })
  }, [])

  async function handleCreate(name: string) {
    const res = await api("/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      const data = await res.json()
      setCampaigns((prev) => [...prev, data.data.campaign])
      setActiveCampaignId(data.data.campaign.id)
      toast.success(`Campaign "${name}" created`)
    } else {
      toast.error("Failed to create campaign")
    }
  }

  async function handleDelete(id: string) {
    const res = await api(`/campaigns/${id}`, { method: "DELETE" })
    if (res.ok) {
      setCampaigns((prev) => prev.filter((c) => c.id !== id))
      if (activeCampaignId === id) setActiveCampaignId(null)
      toast.success("Campaign deleted")
    } else {
      toast.error("Failed to delete campaign")
    }
  }

  async function handleAddRow(campaignId: string, rowId: string) {
    const res = await api(`/campaigns/${campaignId}/rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowId }),
    })
    if (res.ok) {
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === campaignId ? { ...c, rowIds: [...c.rowIds, rowId] } : c,
        ),
      )
    }
  }

  async function handleRemoveRow(campaignId: string, rowId: string) {
    const res = await api(`/campaigns/${campaignId}/rows/${rowId}`, { method: "DELETE" })
    if (res.ok) {
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === campaignId ? { ...c, rowIds: c.rowIds.filter((id) => id !== rowId) } : c,
        ),
      )
    }
  }

  return (
    <CampaignTable
      allRows={rows}
      allColumns={columns}
      campaigns={campaigns}
      activeCampaignId={activeCampaignId}
      onSetActiveCampaign={setActiveCampaignId}
      onCreateCampaign={handleCreate}
      onDeleteCampaign={handleDelete}
      onAddRowToCampaign={handleAddRow}
      onRemoveRowFromCampaign={handleRemoveRow}
    />
  )
}
