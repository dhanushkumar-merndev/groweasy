import Papa from "papaparse"
import ExcelJS from "exceljs"

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
const SUPPORTED_EXCEL_EXTENSIONS = [".xlsx"]
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const FORMULA_LIKE_RE = /^([=+@]|-[A-Za-z(])/
const SAFE_PLUS_NUMBER_RE = /^\+\d[\d\s().-]*$/

export async function parseFileToRawRows(file: File): Promise<ParsedRawUpload> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Upload files up to 10 MB so the browser can parse them safely.")
  }

  const fileName = file.name.toLowerCase()

  if (fileName.endsWith(".csv")) {
    return parseCsvFile(file)
  }

  if (SUPPORTED_EXCEL_EXTENSIONS.some((extension) => fileName.endsWith(extension))) {
    return parseExcelFile(file)
  }

  throw new Error("Upload a CSV or XLSX file.")
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
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const sheets: ParsedRawUpload["sheets"] = []
  const rows: RawBatchRow[] = []

  workbook.worksheets.forEach((worksheet, sheetIndex) => {
    const matrix = worksheetToMatrix(worksheet)

    if (isFullyEmptyMatrix(matrix)) {
      return
    }

    const sheetRows = rowsFromMatrix(matrix, worksheet.name, sheetIndex)

    sheets.push({ name: worksheet.name, rows: sheetRows.length })
    rows.push(...sheetRows)
  })

  return { sheets, rows }
}

function worksheetToMatrix(worksheet: ExcelJS.Worksheet) {
  const matrix: string[][] = []
  const maxColumn = worksheet.actualColumnCount || worksheet.columnCount

  worksheet.eachRow({ includeEmpty: true }, (worksheetRow, rowIndex) => {
    const cells: string[] = []

    for (let columnIndex = 1; columnIndex <= maxColumn; columnIndex += 1) {
      cells.push(cellToString(worksheetRow.getCell(columnIndex)))
    }

    matrix[rowIndex - 1] = cells
  })

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
  if (isExcelCell(value)) {
    return cellToString(extractExcelCellValue(value))
  }

  if (value === null || value === undefined) {
    return ""
  }

  if (typeof value === "object" && "w" in value && typeof value.w === "string") {
    return value.w
  }

  if (typeof value === "object" && "v" in value) {
    return cellToString(value.v)
  }

  const compact = String(value).replace(/\s+/g, " ").trim()

  if (FORMULA_LIKE_RE.test(compact) && !SAFE_PLUS_NUMBER_RE.test(compact)) {
    return `'${compact}`
  }

  return compact
}

function isExcelCell(value: unknown): value is ExcelJS.Cell {
  return Boolean(value && typeof value === "object" && "value" in value && "text" in value)
}

function extractExcelCellValue(cell: ExcelJS.Cell) {
  const value = cell.value

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (value && typeof value === "object" && "formula" in value) {
    return `=${String(value.formula ?? "")}`
  }

  if (value && typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((item) => item.text).join("")
  }

  if (value && typeof value === "object" && "text" in value) {
    return String(value.text ?? "")
  }

  return value ?? cell.text
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
