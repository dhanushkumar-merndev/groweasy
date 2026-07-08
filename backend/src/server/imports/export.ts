import * as XLSX from "xlsx"

import type { SavedRow, Template } from "../../lib/types.js"

export function buildExcelExport(input: {
  rows: SavedRow[]
  template: Template
  mode: "all_good" | "same_tabs" | "selected_sheet" | "filtered" | "missing_summary"
  sheetName?: string
}) {
  const workbook = XLSX.utils.book_new()
  const rows = input.sheetName ? input.rows.filter((row) => row.sheet_name === input.sheetName) : input.rows

  if (input.mode === "same_tabs") {
    const sheets = new Map<string, SavedRow[]>()

    for (const row of rows) {
      sheets.set(row.sheet_name, [...(sheets.get(row.sheet_name) ?? []), row])
    }

    for (const [sheetName, sheetRows] of sheets.entries()) {
      appendRowsSheet(workbook, safeSheetName(sheetName), sheetRows, input.template)
    }
  } else {
    appendRowsSheet(workbook, "Cleaned Data", rows, input.template)
  }

  const summary = [
    ["Metric", "Value"],
    ["Saved rows", rows.length],
    ["Sheets", new Set(rows.map((row) => row.sheet_name)).size],
    ["Exported at", new Date().toISOString()],
  ]
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), "Summary")

  return XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
  }) as Buffer
}

function appendRowsSheet(workbook: XLSX.WorkBook, sheetName: string, rows: SavedRow[], template: Template) {
  const headers = template.columns_config.map((column) => column.export_title)
  const body = rows.map((row) =>
    template.columns_config.map((column) => row.cleaned_data[column.key] ?? "")
  )
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...body])

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
}

function safeSheetName(value: string) {
  return value.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet"
}
