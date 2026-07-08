import {
  demoUserId,
  sampleCleanedRows,
  sampleHistory,
  sampleImport,
  sampleSavedRows,
  sampleSheets,
  sampleTemplates,
} from "../../lib/data/sample-data.js"
import type {
  CleanedRow,
  HistoryAction,
  HistoryLog,
  ImportJob,
  ImportSheet,
  ImportStatus,
  RawImportRow,
  RowData,
  SavedRow,
  Template,
} from "../../lib/types.js"
import { invalidateAnalyticsCache, invalidateImportCache } from "../redis/cache.js"

type StoreState = {
  templates: Template[]
  imports: ImportJob[]
  sheets: ImportSheet[]
  cleanedRows: CleanedRow[]
  savedRows: SavedRow[]
  history: HistoryLog[]
}

const state: StoreState = {
  templates: [...sampleTemplates],
  imports: [sampleImport],
  sheets: [...sampleSheets],
  cleanedRows: [...sampleCleanedRows],
  savedRows: [...sampleSavedRows],
  history: [...sampleHistory],
}

export const store = {
  listTemplates(userId: string) {
    return state.templates.filter((template) => template.user_id === userId || template.user_id === demoUserId)
  },

  getTemplate(userId: string, id: string) {
    return this.listTemplates(userId).find((template) => template.id === id) ?? null
  },

  upsertTemplate(userId: string, input: Omit<Template, "user_id" | "created_at" | "updated_at"> & Partial<Pick<Template, "created_at" | "updated_at">>) {
    const now = new Date().toISOString()
    const existingIndex = state.templates.findIndex((template) => template.id === input.id && template.user_id === userId)
    const template: Template = {
      ...input,
      user_id: userId,
      created_at: input.created_at ?? now,
      updated_at: now,
    }

    if (existingIndex >= 0) {
      state.templates[existingIndex] = template
    } else {
      state.templates.unshift(template)
    }

    return template
  },

  deleteTemplate(userId: string, id: string) {
    const before = state.templates.length
    state.templates = state.templates.filter((template) => !(template.id === id && template.user_id === userId))

    return state.templates.length < before
  },

  listImports(userId: string) {
    return state.imports.filter((job) => job.user_id === userId || job.user_id === demoUserId)
  },

  getImport(userId: string, id: string) {
    return this.listImports(userId).find((job) => job.id === id) ?? null
  },

  createImport(userId: string, input: {
    id: string
    templateId: string
    fileName: string
    rows: RawImportRow[]
    sheets: ImportSheet[]
    blankRowsRemoved: number
  }) {
    const now = new Date().toISOString()
    const job: ImportJob = {
      id: input.id,
      user_id: userId,
      template_id: input.templateId,
      file_name: input.fileName,
      import_name: input.fileName.replace(/\.[^.]+$/, ""),
      status: "validated",
      prompt_version: "excel-cleaner-v1",
      model_used: null,
      total_sheets: input.sheets.length,
      total_rows: input.rows.length,
      good_count: 0,
      missing_count: 0,
      skipped_count: 0,
      fixed_missing_count: 0,
      final_saved_count: 0,
      blank_rows_removed: input.blankRowsRemoved,
      duplicate_count: 0,
      ai_changed_count: 0,
      missing_by_field: {},
      sheet_summary: input.sheets.map((sheet) => ({
        sheet_id: sheet.id,
        sheet_name: sheet.sheet_name,
        sheet_index: sheet.sheet_index,
        total_rows: sheet.total_rows,
        good_count: 0,
        missing_count: 0,
        skipped_count: 0,
      })),
      created_at: now,
      updated_at: now,
    }

    state.imports.unshift(job)
    state.sheets = [...input.sheets, ...state.sheets]
    void this.addHistory(userId, input.id, "file_uploaded", {
      file_name: input.fileName,
      total_rows: input.rows.length,
    })

    return job
  },

  updateImport(userId: string, id: string, patch: Partial<ImportJob>) {
    const existing = this.getImport(userId, id)

    if (!existing) {
      return null
    }

    const updated: ImportJob = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    }
    state.imports = state.imports.map((job) => (job.id === id ? updated : job))

    return updated
  },

  setStatus(userId: string, id: string, status: ImportStatus) {
    return this.updateImport(userId, id, { status })
  },

  listSheets(importId: string) {
    return state.sheets.filter((sheet) => sheet.import_id === importId)
  },

  setCleanedRows(importId: string, rows: CleanedRow[]) {
    state.cleanedRows = [...rows, ...state.cleanedRows.filter((row) => row.import_id !== importId)]
  },

  listCleanedRows(importId: string) {
    return state.cleanedRows.filter((row) => row.import_id === importId)
  },

  listSavedRows(userId: string, importId: string) {
    return state.savedRows.filter((row) => row.import_id === importId && (row.user_id === userId || row.user_id === demoUserId))
  },

  appendSavedRow(userId: string, importId: string, input: {
    sheet_name: string
    sheet_index: number
    row_index: number
    cleaned_data: RowData
  }) {
    const row: SavedRow = {
      id: crypto.randomUUID(),
      user_id: userId,
      import_id: importId,
      sheet_id: null,
      sheet_name: input.sheet_name,
      sheet_index: input.sheet_index,
      row_index: input.row_index,
      cleaned_data: input.cleaned_data,
      ai_changes: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    state.savedRows.push(row)
    void invalidateAnalyticsCache(importId)

    return row
  },

  updateSavedRow(userId: string, rowId: string, cleanedData: RowData) {
    const existing = state.savedRows.find((row) => row.id === rowId && row.user_id === userId)

    if (!existing) {
      return null
    }

    const updated: SavedRow = {
      ...existing,
      cleaned_data: cleanedData,
      updated_at: new Date().toISOString(),
    }
    state.savedRows = state.savedRows.map((row) => (row.id === rowId ? updated : row))
    void invalidateAnalyticsCache(existing.import_id)

    return updated
  },

  deleteSavedRow(userId: string, rowId: string) {
    const existing = state.savedRows.find((row) => row.id === rowId && row.user_id === userId)

    if (!existing) {
      return false
    }

    state.savedRows = state.savedRows.filter((row) => row.id !== rowId)
    void invalidateAnalyticsCache(existing.import_id)

    return true
  },

  saveGoodRows(userId: string, importId: string, rows: CleanedRow[]) {
    const goodRows = rows.filter((row) => row.status === "good")
    const savedRows: SavedRow[] = goodRows.map((row) => ({
      id: crypto.randomUUID(),
      user_id: userId,
      import_id: importId,
      sheet_id: row.sheet_id,
      sheet_name: row.sheet_name,
      sheet_index: row.sheet_index,
      row_index: row.row_index,
      cleaned_data: row.cleaned_data,
      ai_changes: row.ai_changes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))

    state.savedRows = [...state.savedRows.filter((row) => row.import_id !== importId), ...savedRows]
    void invalidateImportCache(importId)
    void this.addHistory(userId, importId, "rows_saved", {
      saved_rows: savedRows.length,
      missing_rows: rows.filter((row) => row.status === "missing").length,
      skipped_rows: rows.filter((row) => row.status === "skipped").length,
    })

    return savedRows
  },

  listHistory(userId: string) {
    return state.history.filter((entry) => entry.user_id === userId || entry.user_id === demoUserId)
  },

  addHistory(userId: string, importId: string, action: HistoryAction, meta: Record<string, unknown>) {
    const entry: HistoryLog = {
      id: crypto.randomUUID(),
      user_id: userId,
      import_id: importId,
      action,
      meta,
      created_at: new Date().toISOString(),
    }

    state.history.unshift(entry)

    return entry
  },
}
