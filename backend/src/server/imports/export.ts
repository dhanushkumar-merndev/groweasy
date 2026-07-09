import * as XLSX from "xlsx"

import type { SavedRow, Template } from "../../lib/types.js"
import { logger } from "../../lib/logger.js"

export function buildExcelExport(input: {
  rows: SavedRow[]
  template: Template
  mode: "all_good" | "same_tabs" | "selected_sheet" | "filtered" | "missing_summary"
  sheetName?: string
}) {
  const workbook = XLSX.utils.book_new()
  const rows = input.sheetName ? input.rows.filter((row) => row.sheet_name === input.sheetName) : input.rows

  logger.info({ rowCount: rows.length, mode: input.mode, sheetName: input.sheetName }, "Building Excel export")

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

  const summaryData: (string | number | boolean | null)[][] = [
    ["Metric", "Value"],
    ["Saved rows", rows.length],
    ["Sheets", new Set(rows.map((row) => row.sheet_name)).size],
    ["Exported at", new Date().toISOString()],
  ]
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
  autoFitColumns(summarySheet, summaryData)
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary")

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
  const data = [headers, ...body]
  const worksheet = XLSX.utils.aoa_to_sheet(data)
  autoFitColumns(worksheet, data)

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
}

function autoFitColumns(worksheet: XLSX.WorkSheet, data: (string | number | boolean | null)[][]) {
  if (data.length === 0) return

  const colCount = data[0].length
  const colWidths: number[] = Array(colCount).fill(0)

  for (const row of data) {
    for (let c = 0; c < row.length && c < colCount; c++) {
      const cell = String(row[c] ?? "")
      const lines = cell.split("\n")
      for (const line of lines) {
        const charWidth = [...line].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 127 ? 2 : 1), 0)
        colWidths[c] = Math.max(colWidths[c], charWidth)
      }
    }
  }

  worksheet["!cols"] = colWidths.map((width) => ({
    wch: Math.min(Math.max(width + 2, 8), 50),
  }))
}

function safeSheetName(value: string) {
  return value.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet"
}
