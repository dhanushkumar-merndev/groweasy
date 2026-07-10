import Papa from "papaparse"
import * as XLSX from "xlsx"

import type { Template, TemplateColumn } from "@/lib/types"

export type RawBatchTemplateColumn = {
  key: string
  label: string
  type: string
  required: boolean
}

export type RawBatchTemplate = {
  name: string
  columns: RawBatchTemplateColumn[]
}

export type RawBatchRow = {
  source_sheet: string
  source_sheet_index: number
  source_row_index: number
  data: Record<string, string>
}

export type RawBatchPayload = {
  batch_id: string
  selected_template: RawBatchTemplate
  rows: RawBatchRow[]
}

export type ParsedRawUpload = {
  sheets: Array<{
    name: string
    rows: number
  }>
  rows: RawBatchRow[]
}

const CSV_SHEET_NAME = "CSV Upload"
const SUPPORTED_EXCEL_EXTENSIONS = [".xlsx", ".xls"]

export async function parseFileToRawRows(file: File): Promise<ParsedRawUpload> {
  const fileName = file.name.toLowerCase()

  if (fileName.endsWith(".csv")) {
    return parseCsvFile(file)
  }

  if (SUPPORTED_EXCEL_EXTENSIONS.some((extension) => fileName.endsWith(extension))) {
    return parseExcelFile(file)
  }

  throw new Error("Upload a CSV, XLS, or XLSX file.")
}

export function createRawBatchPayload(template: Template, parsedUpload: ParsedRawUpload): RawBatchPayload {
  return {
    batch_id: `batch_${crypto.randomUUID()}`,
    selected_template: {
      name: template.name,
      columns: template.columns_config.map(toRawBatchColumn),
    },
    rows: parsedUpload.rows,
  }
}

async function parseCsvFile(file: File): Promise<ParsedRawUpload> {
  const text = await file.text()
  const parsed = Papa.parse<string[]>(text, {
    dynamicTyping: false,
    header: false,
    skipEmptyLines: false,
  })

  const fatalError = parsed.errors.find((error) => error.code !== "UndetectableDelimiter")

  if (fatalError) {
    throw new Error(fatalError.message)
  }

  const matrix = parsed.data.map((row) => row.map((cell) => cellToString(cell)))
  const rows = rowsFromMatrix(matrix, CSV_SHEET_NAME, 0)

  return {
    sheets: [{ name: CSV_SHEET_NAME, rows: rows.length }],
    rows,
  }
}

async function parseExcelFile(file: File): Promise<ParsedRawUpload> {
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    bookFiles: false,
    bookVBA: false,
    cellFormula: false,
    cellText: true,
  })
  const sheets: ParsedRawUpload["sheets"] = []
  const rows: RawBatchRow[] = []

  workbook.SheetNames.forEach((sheetName, sheetIndex) => {
    const matrix = worksheetToMatrix(workbook.Sheets[sheetName])

    if (isFullyEmptyMatrix(matrix)) {
      return
    }

    const sheetRows = rowsFromMatrix(matrix, sheetName, sheetIndex)

    sheets.push({ name: sheetName, rows: sheetRows.length })
    rows.push(...sheetRows)
  })

  return { sheets, rows }
}

function worksheetToMatrix(worksheet: XLSX.WorkSheet | undefined) {
  const ref = worksheet?.["!ref"]

  if (!worksheet || !ref) {
    return []
  }

  const range = XLSX.utils.decode_range(ref)
  const matrix: string[][] = []

  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row: string[] = []

    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })
      row.push(cellToString(worksheet[address]))
    }

    matrix.push(row)
  }

  return matrix
}

function rowsFromMatrix(matrix: string[][], sourceSheet: string, sourceSheetIndex: number) {
  const headerRow = matrix[0] ?? []
  const headers = normalizeHeaders(headerRow)
  const dataRows = dropTrailingEmptyRows(matrix.slice(1))

	  return dataRows.map((row, rowIndex) => ({
	    source_sheet: sourceSheet,
	    source_sheet_index: sourceSheetIndex,
	    source_row_index: rowIndex + 1,
	    data: rowDataFromCells(headers, row),
	  }))
}

function rowDataFromCells(headers: string[], cells: string[]) {
  const data: Record<string, string> = {}
  const width = Math.max(headers.length, cells.length)

  for (let index = 0; index < width; index += 1) {
    data[headers[index] ?? `Column ${index + 1}`] = cells[index] ?? ""
  }

  return data
}

function normalizeHeaders(headerRow: string[]) {
  if (headerRow.length === 0) {
    return ["Column 1"]
  }

  return headerRow.map((header, index) => {
    const normalized = header.replace(/^\uFEFF/, "").trim()

    return normalized || `Column ${index + 1}`
  })
}

function dropTrailingEmptyRows(rows: string[][]) {
  let endIndex = rows.length

  while (endIndex > 0 && isFullyEmptyRow(rows[endIndex - 1])) {
    endIndex -= 1
  }

  return rows.slice(0, endIndex)
}

function isFullyEmptyRow(row: string[] | undefined) {
  return !row || row.every((cell) => cell === "")
}

function isFullyEmptyMatrix(matrix: string[][]) {
  return matrix.length === 0 || matrix.every(isFullyEmptyRow)
}

function cellToString(value: unknown) {
  if (value === null || value === undefined) {
    return ""
  }

  if (typeof value === "object" && "w" in value && typeof value.w === "string") {
    return value.w
  }

  if (typeof value === "object" && "v" in value) {
    return cellToString(value.v)
  }

  return String(value)
}

function toRawBatchColumn(column: TemplateColumn): RawBatchTemplateColumn {
  return {
    key: column.key,
    label: column.label,
    type: inferColumnType(column),
    required: column.required,
  }
}

function inferColumnType(column: TemplateColumn) {
  const combined = `${column.key} ${column.label}`.toLowerCase()

  if (combined.includes("date") || combined.includes("time") || column.format_rules.includes("date_dd_mm_yyyy")) {
    return "datetime"
  }

  if (combined.includes("email")) {
    return "email"
  }

  if (combined.includes("phone") || combined.includes("mobile") || combined.includes("contact")) {
    return "phone"
  }

  return "text"
}
