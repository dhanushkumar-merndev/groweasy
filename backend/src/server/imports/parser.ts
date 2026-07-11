import ExcelJS from "exceljs"

import { sanitizeCellValue } from "../../lib/formatting.js"
import type { ImportSheet, RawImportRow, RowData, ValidationResult, ValidationWarning } from "../../lib/types.js"
import { logger } from "../../lib/logger.js"

type ParseOptions = {
  importId: string
  fileName: string
  removeBlankRows: boolean
  dashValuesBlank: boolean
}

type CellMatrix = Array<Array<string | number | boolean | null>>

const FORMULA_LIKE_RE = /^([=+@]|-[A-Za-z(])/

export async function parseWorkbook(buffer: ArrayBuffer, options: ParseOptions): Promise<ValidationResult> {
  const fileName = options.fileName.toLowerCase()

  if (fileName.endsWith(".csv")) {
    return parseDelimitedWorkbook(buffer, options, ",")
  }

  if (fileName.endsWith(".tsv")) {
    return parseDelimitedWorkbook(buffer, options, "\t")
  }

  if (!fileName.endsWith(".xlsx")) {
    throw new Error("Only .xlsx, .csv, and .tsv files are supported.")
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const sheetInputs = workbook.worksheets.map((worksheet) => ({
    name: worksheet.name,
    state: worksheet.state,
    matrix: worksheetToMatrix(worksheet),
  }))

  return buildValidationResult(sheetInputs, options)
}

function parseDelimitedWorkbook(buffer: ArrayBuffer, options: ParseOptions, delimiter: "," | "\t") {
  const text = Buffer.from(buffer).toString("utf8")
  const matrix = parseDelimitedText(text, delimiter)

  return buildValidationResult(
    [{
      name: delimiter === "," ? "CSV Upload" : "TSV Upload",
      state: "visible",
      matrix,
    }],
    options,
  )
}

function buildValidationResult(
  sheetInputs: Array<{ name: string; state?: string; matrix: CellMatrix }>,
  options: ParseOptions,
): ValidationResult {
  const warnings: ValidationWarning[] = []
  const sheets: ImportSheet[] = []
  const rows: RawImportRow[] = []
  let blankRowsRemoved = 0
  let formulaLikeCells = 0
  let blankSheets = 0

  logger.info({ importId: options.importId, sheetCount: sheetInputs.length }, "Parsing workbook")

  if (sheetInputs.length === 0) {
    warnings.push({
      code: "empty_workbook",
      message: "The workbook does not contain any readable sheets.",
      count: 1,
    })
  }

  sheetInputs.forEach((sheet, sheetIndex) => {
    const sheetId = `${options.importId}_sheet_${sheetIndex + 1}`
    const matrix = sheet.matrix

    if (sheet.state && sheet.state !== "visible") {
      logger.warn({ sheetName: sheet.name, importId: options.importId }, "Hidden sheet detected")
      warnings.push({
        code: "hidden_sheet",
        message: `${sheet.name} is hidden in the source workbook.`,
        count: 1,
      })
    }

    const headerRow = matrix[0] ?? []
    const headers = normalizeHeaders(headerRow)
    const bodyRows = matrix.slice(1)
    let sheetRowCount = 0

    for (const [bodyIndex, bodyRow] of bodyRows.entries()) {
      const rowData = rowFromCells(headers, bodyRow, options.dashValuesBlank)
      formulaLikeCells += countFormulaLikeCells(bodyRow)

      if (!Object.values(rowData).some((value) => String(value ?? "").trim())) {
        blankRowsRemoved += 1
        continue
      }

      sheetRowCount += 1
      rows.push({
        id: `${options.importId}_${sheetIndex}_${bodyIndex + 1}`,
        import_id: options.importId,
        sheet_id: sheetId,
        sheet_name: sheet.name,
        sheet_index: sheetIndex,
        row_index: bodyIndex + 1,
        raw_data: rowData,
      })
    }

    if (sheetRowCount === 0) {
      logger.warn({ sheetName: sheet.name, importId: options.importId }, "Blank sheet skipped")
      blankSheets += 1
      return
    }

    sheets.push({
      id: sheetId,
      import_id: options.importId,
      sheet_name: sheet.name,
      sheet_index: sheetIndex,
      total_rows: sheetRowCount,
      good_count: 0,
      missing_count: 0,
      skipped_count: 0,
      created_at: new Date().toISOString(),
    })
  })

  if (blankSheets > 0) {
    warnings.push({
      code: "blank_sheet",
      message: `${blankSheets} blank sheet${blankSheets === 1 ? "" : "s"} ignored.`,
      count: blankSheets,
    })
  }

  if (blankRowsRemoved > 0) {
    warnings.push({
      code: "blank_rows_removed",
      message: `${blankRowsRemoved} blank row${blankRowsRemoved === 1 ? "" : "s"} removed.`,
      count: blankRowsRemoved,
    })
  }

  if (formulaLikeCells > 0) {
    warnings.push({
      code: "formula_sanitized",
      message: "Formula-like cells were converted to safe text.",
      count: formulaLikeCells,
    })
  }

  warnings.push({
    code: "images_macros_ignored",
    message: "Images, macros, scripts, and embedded workbook objects are ignored.",
    count: 1,
  })

  if (rows.length > 5000) {
    warnings.push({
      code: "too_many_rows",
      message: "Large file detected. The UI will virtualize table rows and process AI work in batches.",
      count: rows.length,
    })
  }

  logger.info({ importId: options.importId, totalRows: rows.length, totalSheets: sheets.length, blankRowsRemoved, warnings: warnings.length }, "Workbook parsing complete")

  return {
    import_id: options.importId,
    rows,
    sheets,
    warnings,
    blank_rows_removed: blankRowsRemoved,
    total_rows: rows.length,
  }
}

function worksheetToMatrix(worksheet: ExcelJS.Worksheet): CellMatrix {
  const matrix: CellMatrix = []
  const maxColumn = worksheet.actualColumnCount || worksheet.columnCount

  worksheet.eachRow({ includeEmpty: true }, (row, rowIndex) => {
    const cells: Array<string | number | boolean | null> = []

    for (let columnIndex = 1; columnIndex <= maxColumn; columnIndex += 1) {
      cells.push(extractCellValue(row.getCell(columnIndex)))
    }

    matrix[rowIndex - 1] = cells
  })

  return trimTrailingEmptyRows(matrix)
}

function extractCellValue(cell: ExcelJS.Cell): string | number | boolean | null {
  const value = cell.value

  if (value === null || value === undefined) {
    return ""
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value
  }

  if (typeof value === "object" && "formula" in value) {
    return `=${String(value.formula ?? "")}`
  }

  if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((item) => item.text).join("")
  }

  if (typeof value === "object" && "text" in value) {
    return String(value.text ?? "")
  }

  return cell.text || ""
}

function parseDelimitedText(text: string, delimiter: "," | "\t") {
  const rows: CellMatrix = []
  let row: string[] = []
  let cell = ""
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (char === '"' && quoted && nextChar === '"') {
      cell += '"'
      index += 1
      continue
    }

    if (char === '"') {
      quoted = !quoted
      continue
    }

    if (char === delimiter && !quoted) {
      row.push(cell)
      cell = ""
      continue
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && nextChar === "\n") {
        index += 1
      }

      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
      continue
    }

    cell += char
  }

  row.push(cell)
  rows.push(row)

  return trimTrailingEmptyRows(rows)
}

function normalizeHeaders(headerRow: Array<string | number | boolean | null>) {
  const normalized = headerRow.map((cell, index) => {
    const value = String(sanitizeCellValue(cell, false) ?? "").trim()

    return value || `Column ${index + 1}`
  })

  if (normalized.length === 0) {
    return ["Column 1"]
  }

  return normalized
}

function rowFromCells(headers: string[], cells: Array<string | number | boolean | null>, dashValuesBlank: boolean): RowData {
  const row: RowData = {}
  const width = Math.max(headers.length, cells.length)

  for (let index = 0; index < width; index += 1) {
    const header = headers[index] ?? `Column ${index + 1}`
    row[header] = sanitizeCellValue(cells[index] ?? "", dashValuesBlank)
  }

  return row
}

function countFormulaLikeCells(cells: Array<string | number | boolean | null>) {
  return cells.filter((cell) => {
    if (cell === null || cell === undefined) {
      return false
    }

    return FORMULA_LIKE_RE.test(String(cell).trim())
  }).length
}

function trimTrailingEmptyRows(rows: CellMatrix) {
  let endIndex = rows.length

  while (endIndex > 0 && rows[endIndex - 1].every((cell) => String(cell ?? "").trim() === "")) {
    endIndex -= 1
  }

  return rows.slice(0, endIndex)
}
