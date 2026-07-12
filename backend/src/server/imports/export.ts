import ExcelJS from "exceljs"

import type { CellValue, SavedRow, Template } from "../../lib/types.js"
import { logger } from "../../lib/logger.js"

/**
 * Excel export builder — generates .xlsx workbooks from saved rows.
 * Supports single-sheet and multi-sheet (same_tabs) export modes.
 * Formula-like cell values are sanitized with a ' prefix.
 */
export async function buildExcelExport(input: {
  rows: SavedRow[]
  template: Template
  mode: "all_good" | "same_tabs" | "selected_sheet" | "filtered" | "missing_summary"
  sheetName?: string
}) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "GrowEasy"
  workbook.created = new Date()
  workbook.modified = new Date()

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

  const summarySheet = workbook.addWorksheet("Summary")
  const summaryData: Array<[string, string | number]> = [
    ["Metric", "Value"],
    ["Saved rows", rows.length],
    ["Sheets", new Set(rows.map((row) => row.sheet_name)).size],
    ["Exported at", new Date().toISOString()],
  ]

  summarySheet.addRows(summaryData)
  autoFitColumns(summarySheet)

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

function appendRowsSheet(workbook: ExcelJS.Workbook, sheetName: string, rows: SavedRow[], template: Template) {
  const worksheet = workbook.addWorksheet(sheetName)
  const headers = template.columns_config.map((column) => column.export_title)

  worksheet.addRow(headers)

  for (const row of rows) {
    worksheet.addRow(template.columns_config.map((column) => toExcelValue(row.cleaned_data[column.key])))
  }

  worksheet.getRow(1).font = { bold: true }
  autoFitColumns(worksheet)
}

function toExcelValue(value: CellValue) {
  if (value === null || value === undefined) {
    return ""
  }

  if (typeof value === "string" && /^([=+@]|-[A-Za-z(])/.test(value.trim())) {
    return `'${value}`
  }

  return value
}

function autoFitColumns(worksheet: ExcelJS.Worksheet) {
  worksheet.columns.forEach((column) => {
    let width = 8

    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const text = String(cell.value ?? "")
      width = Math.max(width, ...text.split("\n").map((line) => line.length + 2))
    })

    column.width = Math.min(width, 50)
  })
}

function safeSheetName(value: string) {
  return value.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet"
}
