import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  demoUserId,
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
import { logger } from "../../lib/logger.js"
import { ensureSchema, addHistoryEntry, listHistoryEntries } from "../db/db-history.js"

type StoreState = {
  templates: Template[]
  imports: ImportJob[]
  sheets: ImportSheet[]
  cleanedRows: CleanedRow[]
  savedRows: SavedRow[]
  history: HistoryLog[]
  userApiKeys: Record<string, string>
}

const storeFilePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.data/store-state.json")

function defaultState(): StoreState {
  return {
    templates: [...sampleTemplates],
    imports: [],
    sheets: [],
    cleanedRows: [],
    savedRows: [],
    history: [],
    userApiKeys: {},
  }
}

function loadState(): StoreState {
  if (!existsSync(storeFilePath)) {
    return defaultState()
  }

  try {
    const parsed = JSON.parse(readFileSync(storeFilePath, "utf8")) as Partial<StoreState>
    return {
      templates: parsed.templates?.length ? parsed.templates : [...sampleTemplates],
      imports: parsed.imports ?? [],
      sheets: parsed.sheets ?? [],
      cleanedRows: parsed.cleanedRows ?? [],
      savedRows: parsed.savedRows ?? [],
      history: parsed.history ?? [],
      userApiKeys: parsed.userApiKeys ?? {},
    }
  } catch (error) {
    logger.warn({ error }, "Failed to load local store state, starting fresh")
    return defaultState()
  }
}

function persistState() {
  try {
    mkdirSync(dirname(storeFilePath), { recursive: true })
    writeFileSync(storeFilePath, JSON.stringify(state, null, 2))
  } catch (error) {
    logger.warn({ error }, "Failed to persist local store state")
  }
}

const state: StoreState = loadState()

if (!state.templates.some((template) => template.user_id === demoUserId)) {
  state.templates.push(...sampleTemplates)
  persistState()
}

/*
 * Local dev persistence keeps import/review pages alive across browser refreshes
 * and backend restarts. It is intentionally a simple JSON snapshot until a real
 * database replaces the in-memory repository.
 */
logger.info({
  imports: state.imports.length,
  cleanedRows: state.cleanedRows.length,
  savedRows: state.savedRows.length,
}, "Local store state loaded")

ensureSchema()

export const store = {
  listTemplates(userId: string) {
    const templates = state.templates.filter((template) => template.user_id === userId || template.user_id === demoUserId)
    logger.debug({ userId, count: templates.length }, "List templates")
    return templates
  },

  getTemplate(userId: string, id: string) {
    const template = this.listTemplates(userId).find((template) => template.id === id) ?? null
    logger.debug({ userId, templateId: id, found: template !== null }, "Get template")
    return template
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
      logger.info({ userId, templateId: template.id }, "Updating template")
      state.templates[existingIndex] = template
    } else {
      logger.info({ userId, templateId: template.id }, "Creating template")
      state.templates.unshift(template)
    }

    persistState()
    return template
  },

  deleteTemplate(userId: string, id: string) {
    const before = state.templates.length
    state.templates = state.templates.filter((template) => !(template.id === id && template.user_id === userId))
    const deleted = state.templates.length < before
    logger.info({ userId, templateId: id, deleted }, "Delete template")
    if (deleted) persistState()
    return deleted
  },

  listImports(userId: string) {
    const jobs = state.imports.filter((job) => job.user_id === userId || job.user_id === demoUserId)
    logger.debug({ userId, count: jobs.length }, "List imports")
    return jobs
  },

  getImport(userId: string, id: string) {
    const job = this.listImports(userId).find((job) => job.id === id) ?? null
    logger.debug({ userId, importId: id, found: job !== null }, "Get import")
    return job
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

    logger.info({ userId, importId: input.id, fileName: input.fileName, totalRows: input.rows.length, totalSheets: input.sheets.length, blankRowsRemoved: input.blankRowsRemoved }, "Import created")
    state.imports.unshift(job)
    state.sheets = [...input.sheets, ...state.sheets]
    void this.addHistory(userId, input.id, "file_uploaded", {
      file_name: input.fileName,
      total_rows: input.rows.length,
    })

    persistState()
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

    logger.debug({ userId, importId: id, patchKeys: Object.keys(patch) }, "Import updated")
    persistState()
    return updated
  },

  setStatus(userId: string, id: string, status: ImportStatus) {
    logger.info({ userId, importId: id, status }, "Import status changed")
    return this.updateImport(userId, id, { status })
  },

  listSheets(importId: string) {
    const sheets = state.sheets.filter((sheet) => sheet.import_id === importId)
    logger.debug({ importId, count: sheets.length }, "List sheets")
    return sheets
  },

  setSheets(importId: string, sheets: ImportSheet[]) {
    logger.info({ importId, count: sheets.length }, "Setting sheets")
    state.sheets = [...sheets, ...state.sheets.filter((sheet) => sheet.import_id !== importId)]
    persistState()
  },

  setCleanedRows(importId: string, rows: CleanedRow[]) {
    logger.info({ importId, count: rows.length }, "Setting cleaned rows")
    state.cleanedRows = [...rows, ...state.cleanedRows.filter((row) => row.import_id !== importId)]
    persistState()
  },

  listCleanedRows(importId: string) {
    const rows = state.cleanedRows.filter((row) => row.import_id === importId)
    logger.debug({ importId, count: rows.length }, "List cleaned rows")
    return rows
  },

  listSavedRows(userId: string, importId: string) {
    const rows = state.savedRows.filter((row) => row.import_id === importId && (row.user_id === userId || row.user_id === demoUserId))
    logger.debug({ userId, importId, count: rows.length }, "List saved rows")
    return rows
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
    logger.info({ userId, importId, rowId: row.id }, "Appended saved row")
    state.savedRows.push(row)
    persistState()
    void invalidateAnalyticsCache(importId)

    return row
  },

  updateSavedRow(userId: string, rowId: string, cleanedData: RowData) {
    const existing = state.savedRows.find((row) => row.id === rowId && row.user_id === userId)

    if (!existing) {
      logger.warn({ userId, rowId }, "Saved row not found for update")
      return null
    }

    const updated: SavedRow = {
      ...existing,
      cleaned_data: cleanedData,
      updated_at: new Date().toISOString(),
    }
    logger.info({ userId, rowId, importId: existing.import_id }, "Updated saved row")
    state.savedRows = state.savedRows.map((row) => (row.id === rowId ? updated : row))
    persistState()
    void invalidateAnalyticsCache(existing.import_id)

    return updated
  },

  deleteSavedRow(userId: string, rowId: string) {
    const existing = state.savedRows.find((row) => row.id === rowId && row.user_id === userId)

    if (!existing) {
      logger.warn({ userId, rowId }, "Saved row not found for deletion")
      return false
    }

    logger.info({ userId, rowId, importId: existing.import_id }, "Deleted saved row")
    state.savedRows = state.savedRows.filter((row) => row.id !== rowId)
    persistState()
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

    logger.info({ userId, importId, savedCount: savedRows.length, totalInput: rows.length }, "Saving good rows")
    state.savedRows = [...state.savedRows.filter((row) => row.import_id !== importId), ...savedRows]
    persistState()
    void invalidateImportCache(importId)
    void this.addHistory(userId, importId, "rows_saved", {
      saved_rows: savedRows.length,
      missing_rows: rows.filter((row) => row.status === "missing").length,
      skipped_rows: rows.filter((row) => row.status === "skipped").length,
    })

    return savedRows
  },

  async listHistory(userId: string) {
    const dbEntries = await listHistoryEntries(userId)
    if (dbEntries && dbEntries.length > 0) {
      logger.debug({ userId, count: dbEntries.length }, "List history from DB")
      return dbEntries
    }
    const entries = state.history.filter((entry) => entry.user_id === userId || entry.user_id === demoUserId)
    logger.debug({ userId, count: entries.length }, "List history from local store")
    return entries
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
    void addHistoryEntry(userId, importId, action, meta)
    logger.info({ userId, importId, action }, "History entry added")
    persistState()
    return entry
  },

  getApiKey(userId: string) {
    return state.userApiKeys[userId] ?? null
  },

  setApiKey(userId: string, encryptedKey: string) {
    state.userApiKeys[userId] = encryptedKey
    persistState()
    logger.info({ userId }, "API key saved")
  },

  deleteApiKey(userId: string) {
    delete state.userApiKeys[userId]
    persistState()
    logger.info({ userId }, "API key removed")
  },

  getApiKeyInfo(userId: string): { provider: string; model: string } | null {
    const raw = state.userApiKeys[userId]
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  },
}
