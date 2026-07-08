"use client"

import { toast } from "sonner"
import { DownloadIcon, FileSpreadsheetIcon, TableIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api-client"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ExportMenu({ importId }: { importId: string }) {
  async function exportExcel(mode: "all_good" | "same_tabs") {
    const response = await api(`/imports/${importId}/export/excel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    })

    if (!response.ok) {
      toast.error("Excel export failed.")
      return
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "cleaned-data.xlsx"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function exportGoogleSheet() {
    const response = await api(`/imports/${importId}/export/google-sheet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ import_id: importId, sheet_name: "Cleaned Data" }),
    })
    const data = (await response.json()) as { message?: string }

    toast.message(data.message ?? (response.ok ? "Google Sheet export requested." : "Google Sheet export failed."))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button />}>
        <DownloadIcon />
        Export
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void exportExcel("all_good")}>
          <FileSpreadsheetIcon />
          One Excel sheet
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void exportExcel("same_tabs")}>
          <TableIcon />
          Same tabs as source
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void exportGoogleSheet()}>
          <FileSpreadsheetIcon />
          Google Sheet
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
