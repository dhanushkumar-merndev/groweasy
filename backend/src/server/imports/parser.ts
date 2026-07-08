import * as XLSX from "xlsx"

import { sanitizeCellValue } from "../../lib/formatting.js"
import type { ImportSheet, RawImportRow, RowData, ValidationResult, ValidationWarning } from "../../lib/types.js"
import { logger } from "../../lib/logger.js"

type ParseOptions = {
  importId: string
  removeBlankRows: boolean
  dashValuesBlank: boolean
}

export function parseWorkbook(buffer: ArrayBuffer, options: ParseOptions): ValidationResult {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    bookVBA: false,
    bookFiles: false,
  })
  const warnings: ValidationWarning[] = []
  const sheets: ImportSheet[] = []
  const rows: RawImportRow[] = []
  const hiddenSheetNames = new Set(
    workbook.Workbook?.Sheets?.filter((sheet) => Number(sheet.Hidden ?? 0) > 0).map((sheet) => sheet.name) ?? []
  )
  let blankRowsRemoved = 0
  let formulaLikeCells = 0
  let blankSheets = 0

  logger.info({ importId: options.importId, sheetCount: workbook.SheetNames.length }, "Parsing workbook")

  if (workbook.SheetNames.length === 0) {
    warnings.push({
      code: "empty_workbook",
      message: "The workbook does not contain any readable sheets.",
      count: 1,
    })
  }

  workbook.SheetNames.forEach((sheetName, sheetIndex) => {
    const worksheet = workbook.Sheets[sheetName]
    const sheetId = `${options.importId}_sheet_${sheetIndex + 1}`
    const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, {
      header: 1,
      blankrows: false,
      defval: "",
      raw: false,
    })

    if (hiddenSheetNames.has(sheetName)) {
      logger.warn({ sheetName, importId: options.importId }, "Hidden sheet detected")
      warnings.push({
        code: "hidden_sheet",
        message: `${sheetName} is hidden in the source workbook.`,
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
        sheet_name: sheetName,
        sheet_index: sheetIndex,
        row_index: bodyIndex + 1,
        raw_data: rowData,
      })
    }

    if (sheetRowCount === 0) {
      logger.warn({ sheetName, importId: options.importId }, "Blank sheet skipped")
      blankSheets += 1
      return
    }

    sheets.push({
      id: sheetId,
      import_id: options.importId,
      sheet_name: sheetName,
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

function normalizeHeaders(headerRow: (string | number | boolean | null)[]) {
  const normalized = headerRow.map((cell, index) => {
    const value = String(sanitizeCellValue(cell, false) ?? "").trim()

    return value || `Column ${index + 1}`
  })

  if (normalized.length === 0) {
    return ["Column 1"]
  }

  return normalized
}

function rowFromCells(headers: string[], cells: (string | number | boolean | null)[], dashValuesBlank: boolean): RowData {
  const row: RowData = {}
  const width = Math.max(headers.length, cells.length)

  for (let index = 0; index < width; index += 1) {
    const header = headers[index] ?? `Column ${index + 1}`
    row[header] = sanitizeCellValue(cells[index] ?? "", dashValuesBlank)
  }

  return row
}

function countFormulaLikeCells(cells: (string | number | boolean | null)[]) {
  return cells.filter((cell) => {
    if (cell === null || cell === undefined) {
      return false
    }

    return /^([=+@]|-[A-Za-z(])/.test(String(cell).trim())
  }).length
}
