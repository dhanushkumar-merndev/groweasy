"use client"

import Link from "next/link"
import { BarChart3Icon, DownloadIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import type { SavedRow, Template } from "@/lib/types"

export function TemplateTableActions({
  rows,
  template,
}: {
  rows: SavedRow[]
  template: Template
}) {
  function exportCsv() {
    const columns = template.columns_config
    const headers = columns.map((column) => column.export_title || column.label)
    const body = rows.map((row) =>
      columns.map((column) => csvCell(row.cleaned_data[column.key])).join(","),
    )
    const csv = [headers.map(csvCell).join(","), ...body].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")

    anchor.href = url
    anchor.download = `${template.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "template"}-rows.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    toast.success("Template rows exported.")
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
        <DownloadIcon />
        Export
      </Button>
      <Button size="sm" render={<Link href={`/analytics/${template.id}`} />}>
        <BarChart3Icon />
        View Analytics
      </Button>
    </div>
  )
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`
}
