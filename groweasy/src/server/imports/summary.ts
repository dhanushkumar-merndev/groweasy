import "server-only"

import type { CleanedRow, ImportSheet, ImportSummary, SheetSummary } from "@/lib/types"

export function summarizeCleanedRows(rows: CleanedRow[], sheets: ImportSheet[], blankRowsRemoved = 0): ImportSummary {
  const missingByField: Record<string, number> = {}
  const sheetSummary: SheetSummary[] = sheets.map((sheet) => {
    const sheetRows = rows.filter((row) => row.sheet_id === sheet.id)

    return {
      sheet_id: sheet.id,
      sheet_name: sheet.sheet_name,
      sheet_index: sheet.sheet_index,
      total_rows: sheetRows.length,
      good_count: sheetRows.filter((row) => row.status === "good").length,
      missing_count: sheetRows.filter((row) => row.status === "missing").length,
      skipped_count: sheetRows.filter((row) => row.status === "skipped").length,
    }
  })

  for (const row of rows) {
    for (const field of row.missing_fields) {
      missingByField[field] = (missingByField[field] ?? 0) + 1
    }
  }

  return {
    total_rows: rows.length,
    good_count: rows.filter((row) => row.status === "good").length,
    missing_count: rows.filter((row) => row.status === "missing").length,
    skipped_count: rows.filter((row) => row.status === "skipped").length,
    fixed_missing_count: 0,
    final_saved_count: 0,
    blank_rows_removed: blankRowsRemoved,
    duplicate_count: 0,
    ai_changed_count: rows.reduce((total, row) => total + row.ai_changes.length, 0),
    missing_by_field: missingByField,
    sheet_summary: sheetSummary,
  }
}
