import type { RawImportRow } from "@/lib/types"
import { idbDelete, idbGet, idbSet } from "@/lib/idb-store"

export type LocalValidationPreview = {
  importId: string
  rows: RawImportRow[]
  blankRowsRemoved: number
  removeBlankRows: boolean
  dashValuesBlank: boolean
  requireBothEmailPhone: boolean
  generateDescription: boolean
}

type LegacyRawImportRow = RawImportRow & {
  source_sheet?: string
  source_sheet_index?: number
  source_row_index?: number
  data?: RawImportRow["raw_data"]
}

function validationPreviewKey(importId: string) {
  return `groweasy-validation-preview:${importId}`
}

const memoryCache = new Map<string, LocalValidationPreview>()

export function normalizeLocalValidationRows(importId: string, rows: RawImportRow[]) {
  return rows.map((row, index) => {
    const legacyRow = row as LegacyRawImportRow
    const sheetIndex = typeof legacyRow.sheet_index === "number" ? legacyRow.sheet_index : legacyRow.source_sheet_index ?? 0
    const rowIndex = typeof legacyRow.row_index === "number" ? legacyRow.row_index : legacyRow.source_row_index ?? index + 1
    const sheetName = legacyRow.sheet_name ?? legacyRow.source_sheet ?? "Upload"
    const sheetId = legacyRow.sheet_id?.startsWith("_sheet_")
      ? `${importId}_sheet_${sheetIndex + 1}`
      : legacyRow.sheet_id ?? `${importId}_sheet_${sheetIndex + 1}`

    return {
      ...legacyRow,
      id: legacyRow.id ?? `${importId}_${sheetIndex}_${rowIndex}`,
      import_id: importId,
      sheet_id: sheetId,
      sheet_name: sheetName,
      sheet_index: sheetIndex,
      row_index: rowIndex,
      raw_data: legacyRow.raw_data ?? legacyRow.data ?? {},
    }
  })
}

export function saveLocalValidationPreview(preview: LocalValidationPreview) {
  if (typeof window === "undefined") return
  const normalized: LocalValidationPreview = {
    ...preview,
    rows: normalizeLocalValidationRows(preview.importId, preview.rows),
  }
  memoryCache.set(preview.importId, normalized)
  idbSet(validationPreviewKey(preview.importId), normalized)
}

export function readLocalValidationPreview(importId: string) {
  if (typeof window === "undefined") return null
  return memoryCache.get(importId) ?? null
}

export async function ensureLocalValidationPreview(importId: string) {
  if (typeof window === "undefined") return null
  const cached = memoryCache.get(importId)
  if (cached) return cached
  const stored = await idbGet<LocalValidationPreview>(validationPreviewKey(importId))
  if (stored) {
    memoryCache.set(importId, stored)
    return stored
  }
  return null
}

export function clearLocalValidationPreview(importId: string) {
  if (typeof window === "undefined") return
  memoryCache.delete(importId)
  idbDelete(validationPreviewKey(importId))
}
