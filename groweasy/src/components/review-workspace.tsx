"use client"

import { useState } from "react"
import { toast } from "sonner"
import { SaveIcon } from "lucide-react"

import { DataGrid } from "@/components/data-grid"
import { ExportMenu } from "@/components/export-menu"
import { Button } from "@/components/ui/button"
import type { CleanedRow, Template } from "@/lib/types"

export function ReviewWorkspace({
  importId,
  rows,
  template,
}: {
  importId: string
  rows: CleanedRow[]
  template: Template
}) {
  const [editableRows, setEditableRows] = useState(rows)
  const [pending, setPending] = useState(false)

  async function saveRows() {
    setPending(true)

    try {
      const response = await fetch(`/api/imports/${importId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: editableRows }),
      })
      const data = (await response.json()) as { saved_rows?: number; error?: { message?: string } }

      if (!response.ok) {
        throw new Error(data.error?.message ?? "Unable to save rows.")
      }

      toast.success(`Saved ${data.saved_rows ?? 0} good or fixed rows.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save rows.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={saveRows} disabled={pending}>
          <SaveIcon />
          {pending ? "Saving..." : "Save good rows"}
        </Button>
        <ExportMenu importId={importId} />
      </div>
      <DataGrid rows={editableRows} template={template} onRowsChange={setEditableRows} />
    </div>
  )
}
