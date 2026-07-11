import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  defaultTemplateId,
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
import { getSupabaseServiceClient } from "../db/supabase.js"

type Campaign = {
  id: string
  user_id: string
  name: string
  rowIds: string[]
  created_at: string
}

type StoreState = {
  templates: Template[]
  imports: ImportJob[]
  sheets: ImportSheet[]
  cleanedRows: CleanedRow[]
  savedRows: SavedRow[]
  history: HistoryLog[]
  userApiKeys: Record<string, string>
  userApiKeyModes: Record<string, boolean>
  userAiSettings: Record<string, { batchSize: number; requestBatchSize: number }>
  campaigns: Campaign[]
}

const storeFilePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.data/store-state.json")
const localStorePersistEnabled = process.env.NODE_ENV !== "production" && process.env.LOCAL_STORE_PERSIST !== "false"

function defaultState(): StoreState {
  return {
    templates: [...sampleTemplates],
    imports: [],
    sheets: [],
    cleanedRows: [],
    savedRows: [],
    history: [],
    userApiKeys: {},
    userApiKeyModes: {},
    userAiSettings: {},
    campaigns: [],
  }
}

function loadState(): StoreState {
  if (!localStorePersistEnabled) {
    return defaultState()
  }

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
      userApiKeyModes: parsed.userApiKeyModes ?? {},
      userAiSettings: parsed.userAiSettings ?? {},
      campaigns: parsed.campaigns ?? [],
    }
  } catch (error) {
    logger.warn({ error }, "Failed to load local store state, starting fresh")
    return defaultState()
  }
}

function persistState() {
  if (!localStorePersistEnabled) {
    return
  }

  try {
    mkdirSync(dirname(storeFilePath), { recursive: true })
    writeFileSync(storeFilePath, JSON.stringify(state, null, 2))
  } catch (error) {
    logger.warn({ error }, "Failed to persist local store state")
  }
}

function normalizeHintKey(value: string) {
  return value.trim().toLowerCase().replace(/[_\W]+/g, " ")
}

async function syncSavedRowsToSupabase(userId: string, importId: string, savedRows: SavedRow[]) {
  const supabase = getSupabaseServiceClient()

  if (!supabase) {
    logger.info({ importId, savedCount: savedRows.length }, "Supabase not configured, saved rows kept locally")
    return
  }

  const job = state.imports.find((item) => item.id === importId && (item.user_id === userId || item.user_id === demoUserId))
  const templateId = job?.template_id ?? defaultTemplateId
  const now = new Date().toISOString()

  try {
    await ensureTemplateInSupabase(userId, templateId)

    const { error: importError } = await supabase
      .from("imports")
      .upsert({
        id: importId,
        user_id: userId,
        template_id: templateId,
        file_name: job?.file_name ?? "Imported file",
        import_name: job?.import_name ?? job?.file_name ?? "Imported file",
        status: "saved",
        prompt_version: job?.prompt_version ?? null,
        model_used: job?.model_used ?? null,
        total_sheets: job?.total_sheets ?? 0,
        total_rows: job?.total_rows ?? savedRows.length,
        good_count: job?.good_count ?? savedRows.length,
        missing_count: job?.missing_count ?? 0,
        skipped_count: job?.skipped_count ?? 0,
        fixed_missing_count: job?.fixed_missing_count ?? 0,
        final_saved_count: savedRows.length,
        blank_rows_removed: job?.blank_rows_removed ?? 0,
        duplicate_count: job?.duplicate_count ?? 0,
        ai_changed_count: job?.ai_changed_count ?? 0,
        missing_by_field: job?.missing_by_field ?? {},
        sheet_summary: job?.sheet_summary ?? [],
        updated_at: now,
      }, { onConflict: "id" })

    if (importError) {
      throw importError
    }

    const { error: deleteError } = await supabase
      .from("saved_rows")
      .delete()
      .eq("user_id", userId)
      .eq("import_id", importId)

    if (deleteError) {
      throw deleteError
    }

    if (savedRows.length === 0) {
      logger.info({ importId }, "Cleared Supabase saved rows")
      return
    }

    const { error: insertError } = await supabase
      .from("saved_rows")
      .insert(savedRows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        import_id: row.import_id,
        sheet_id: isUuid(row.sheet_id) ? row.sheet_id : null,
        sheet_name: row.sheet_name,
        sheet_index: row.sheet_index,
        row_index: row.row_index,
        cleaned_data: row.cleaned_data,
        ai_changes: row.ai_changes,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })))

    if (insertError) {
      throw insertError
    }

    logger.info({ importId, savedCount: savedRows.length }, "Saved rows synced to Supabase")
  } catch (error) {
    logger.error({ error, importId, savedCount: savedRows.length }, "Failed to sync saved rows to Supabase")
    throw error
  }
}

async function updateSavedRowInSupabase(
  userId: string,
  importId: string,
  rowId: string,
  cleanedData: RowData,
  updatedAt: string,
) {
  const supabase = getSupabaseServiceClient()

  if (!supabase) {
    return
  }

  const { error } = await supabase
    .from("saved_rows")
    .update({
      cleaned_data: cleanedData,
      updated_at: updatedAt,
    })
    .eq("id", rowId)
    .eq("user_id", userId)
    .eq("import_id", importId)

  if (error) {
    logger.error({ error, userId, importId, rowId }, "Failed to update saved row in Supabase")
    throw error
  }
}

async function deleteSavedRowFromSupabase(userId: string, importId: string, rowId: string) {
  const supabase = getSupabaseServiceClient()

  if (!supabase) {
    return
  }

  const { error } = await supabase
    .from("saved_rows")
    .delete()
    .eq("id", rowId)
    .eq("user_id", userId)
    .eq("import_id", importId)

  if (error) {
    logger.error({ error, userId, importId, rowId }, "Failed to delete saved row from Supabase")
    throw error
  }
}

function isUuid(value: string | null | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
}

async function ensureTemplateInSupabase(userId: string, templateId: string) {
  const supabase = getSupabaseServiceClient()
  if (!supabase) return

  const template = state.templates.find((item) => item.id === templateId)
    ?? sampleTemplates.find((item) => item.id === templateId)

  if (!template) {
    logger.warn({ templateId }, "Cannot sync import because template is missing locally")
    return
  }

  const { error } = await supabase
    .from("templates")
      .upsert({
        id: template.id,
        user_id: userId,
        name: template.name,
        columns_config: template.columns_config,
        formatting_rules: template.formatting_rules,
      created_at: template.created_at,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" })

  if (error) {
    logger.error({ error, templateId }, "Failed to ensure template exists in Supabase")
    throw error
  }
}

async function listTemplatesFromSupabase(userId: string) {
  const supabase = getSupabaseServiceClient()

  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })

  if (error) {
    logger.error({ error, userId }, "Failed to list templates from Supabase")
    throw error
  }

  return (data ?? []).map(normalizeTemplateRow)
}

async function getTemplateFromSupabase(userId: string, templateId: string) {
  const supabase = getSupabaseServiceClient()

  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .eq("id", templateId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    logger.error({ error, userId, templateId }, "Failed to get template from Supabase")
    throw error
  }

  return data ? normalizeTemplateRow(data) : null
}

async function syncTemplateToSupabase(template: Template) {
  const supabase = getSupabaseServiceClient()

  if (!supabase) {
    return
  }

  const { error } = await supabase
    .from("templates")
    .upsert({
      id: template.id,
      user_id: template.user_id,
      name: template.name,
      columns_config: template.columns_config,
      formatting_rules: template.formatting_rules,
      created_at: template.created_at,
      updated_at: template.updated_at,
    }, { onConflict: "id" })

  if (error) {
    logger.error({ error, templateId: template.id }, "Failed to sync template to Supabase")
    throw error
  }
}

async function deleteTemplateFromSupabase(userId: string, templateId: string) {
  const supabase = getSupabaseServiceClient()

  if (!supabase) {
    return false
  }

  const { error } = await supabase
    .from("templates")
    .delete()
    .eq("id", templateId)
    .eq("user_id", userId)

  if (error) {
    logger.error({ error, userId, templateId }, "Failed to delete template from Supabase")
    throw error
  }

  return true
}

function normalizeTemplateRow(row: Record<string, any>): Template {
  const now = new Date().toISOString()

  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name ?? "Untitled template"),
    columns_config: Array.isArray(row.columns_config) ? row.columns_config : [],
    formatting_rules: row.formatting_rules && typeof row.formatting_rules === "object" ? row.formatting_rules : {},
    created_at: String(row.created_at ?? now),
    updated_at: String(row.updated_at ?? row.created_at ?? now),
  }
}

function cacheUserTemplates(userId: string, templates: Template[]) {
  state.templates = [
    ...templates,
    ...state.templates.filter((template) => template.user_id !== userId),
  ]
  persistState()
}

async function listImportsFromSupabase(userId: string) {
  const supabase = getSupabaseServiceClient()

  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from("imports")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })

  if (error) {
    logger.warn({ error, userId }, "Failed to load imports from Supabase")
    return []
  }

  return (data ?? []).map((row) => normalizeImportRow(row))
}

async function listSavedRowsFromSupabase(userId: string, importId?: string) {
  const supabase = getSupabaseServiceClient()

  if (!supabase) {
    return []
  }

  let query = supabase
    .from("saved_rows")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (importId) {
    query = query.eq("import_id", importId)
  }

  const { data, error } = await query

  if (error) {
    logger.warn({ error, userId, importId }, "Failed to load saved rows from Supabase")
    return []
  }

  return (data ?? []).map((row) => normalizeSavedRow(row))
}

function normalizeImportRow(row: Record<string, any>): ImportJob {
  const now = new Date().toISOString()

  return {
    id: String(row.id),
    user_id: String(row.user_id ?? ""),
    template_id: String(row.template_id ?? defaultTemplateId),
    file_name: String(row.file_name ?? "Imported file"),
    import_name: String(row.import_name ?? row.file_name ?? "Imported file"),
    status: normalizeImportStatus(row.status),
    prompt_version: String(row.prompt_version ?? ""),
    model_used: row.model_used ? String(row.model_used) : null,
    total_sheets: numberOr(row.total_sheets, 0),
    total_rows: numberOr(row.total_rows, 0),
    good_count: numberOr(row.good_count, row.final_saved_count ?? 0),
    missing_count: numberOr(row.missing_count, 0),
    skipped_count: numberOr(row.skipped_count, 0),
    fixed_missing_count: numberOr(row.fixed_missing_count, 0),
    final_saved_count: numberOr(row.final_saved_count, 0),
    blank_rows_removed: numberOr(row.blank_rows_removed, 0),
    duplicate_count: numberOr(row.duplicate_count, 0),
    ai_changed_count: numberOr(row.ai_changed_count, 0),
    missing_by_field: isRecord(row.missing_by_field) ? row.missing_by_field as Record<string, number> : {},
    sheet_summary: Array.isArray(row.sheet_summary) ? row.sheet_summary : [],
    created_at: String(row.created_at ?? now),
    updated_at: String(row.updated_at ?? row.created_at ?? now),
  }
}

function normalizeSavedRow(row: Record<string, any>): SavedRow {
  const now = new Date().toISOString()

  return {
    id: String(row.id),
    user_id: String(row.user_id ?? ""),
    import_id: String(row.import_id ?? ""),
    sheet_id: row.sheet_id ? String(row.sheet_id) : null,
    sheet_name: String(row.sheet_name ?? "Sheet"),
    sheet_index: numberOr(row.sheet_index, 0),
    row_index: numberOr(row.row_index, 0),
    cleaned_data: isRecord(row.cleaned_data) ? row.cleaned_data as RowData : {},
    ai_changes: Array.isArray(row.ai_changes) ? row.ai_changes : [],
    created_at: String(row.created_at ?? now),
    updated_at: String(row.updated_at ?? row.created_at ?? now),
  }
}

function normalizeImportStatus(value: unknown): ImportStatus {
  return ["uploaded", "validated", "processing", "processed", "saved", "failed"].includes(String(value))
    ? String(value) as ImportStatus
    : "saved"
}

function numberOr(value: unknown, fallback: unknown) {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) ? parsed : 0
}

function isRecord(value: unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
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
  mode: localStorePersistEnabled ? "local-json" : "memory-only",
  imports: state.imports.length,
  cleanedRows: state.cleanedRows.length,
  savedRows: state.savedRows.length,
}, localStorePersistEnabled ? "Local store state loaded" : "In-memory store initialized")

ensureSchema()

export const store = {
  listTemplates(userId: string) {
    const templates = state.templates
      .filter((template) => template.user_id === userId || template.user_id === demoUserId)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    logger.debug({ userId, count: templates.length }, "List templates")
    return templates
  },

  async listTemplatesForUser(userId: string) {
    const dbTemplates = await listTemplatesFromSupabase(userId)
    const demoTemplates = state.templates.filter((t) => t.user_id === demoUserId)

    if (dbTemplates.length > 0) {
      cacheUserTemplates(userId, dbTemplates)
      return [...dbTemplates, ...demoTemplates].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      )
    }

    return this.listTemplates(userId)
  },

  getTemplate(userId: string, id: string) {
    const template = this.listTemplates(userId).find((template) => template.id === id) ?? null
    logger.debug({ userId, templateId: id, found: template !== null }, "Get template")
    return template
  },

  async getTemplateForUser(userId: string, id: string) {
    const dbTemplate = await getTemplateFromSupabase(userId, id)

    if (dbTemplate) {
      cacheUserTemplates(userId, [
        dbTemplate,
        ...state.templates.filter((template) => template.user_id === userId && template.id !== id),
      ])
      logger.debug({ userId, templateId: id, source: "supabase" }, "Get template")
      return dbTemplate
    }

    return this.getTemplate(userId, id)
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

  async upsertTemplateForUser(userId: string, input: Omit<Template, "user_id" | "created_at" | "updated_at"> & Partial<Pick<Template, "created_at" | "updated_at">>) {
    const template = this.upsertTemplate(userId, input)
    await syncTemplateToSupabase(template)
    return template
  },

  async addTemplateSourceHints(userId: string, templateId: string, hintsByColumnKey: Record<string, string[]>) {
    const dbTemplate = await getTemplateFromSupabase(userId, templateId)

    if (dbTemplate) {
      cacheUserTemplates(userId, [
        dbTemplate,
        ...state.templates.filter((template) => template.user_id === userId && template.id !== templateId),
      ])
    }

    const index = state.templates.findIndex((template) => template.id === templateId && template.user_id === userId)

    if (index < 0) {
      logger.debug({ userId, templateId }, "Template not eligible for learned source hints")
      return null
    }

    const existing = state.templates[index]
    let added = 0
    const now = new Date().toISOString()
    const columns_config = existing.columns_config.map((column) => {
      const learnedHints = hintsByColumnKey[column.key] ?? []

      if (learnedHints.length === 0) {
        return column
      }

      const currentHints = column.source_hints ?? []
      const seen = new Set(currentHints.map(normalizeHintKey))
      const nextHints = [...currentHints]

      for (const hint of learnedHints) {
        const normalized = normalizeHintKey(hint)

        if (!normalized || seen.has(normalized)) {
          continue
        }

        seen.add(normalized)
        nextHints.push(hint)
        added += 1
      }

      return {
        ...column,
        source_hints: nextHints.slice(0, 24),
      }
    })

    if (added === 0) {
      return existing
    }

    const updated: Template = {
      ...existing,
      columns_config,
      updated_at: now,
    }

    state.templates[index] = updated
    persistState()
    await syncTemplateToSupabase(updated)
    logger.info({ userId, templateId, added }, "Learned source hints added to template")

    return updated
  },

  deleteTemplate(userId: string, id: string) {
    const before = state.templates.length
    state.templates = state.templates.filter((template) => !(template.id === id && template.user_id === userId))
    const deleted = state.templates.length < before
    logger.info({ userId, templateId: id, deleted }, "Delete template")
    if (deleted) persistState()
    return deleted
  },

  async deleteTemplateForUser(userId: string, id: string) {
    const deleted = this.deleteTemplate(userId, id)
    await deleteTemplateFromSupabase(userId, id)
    return deleted
  },

  listImports(userId: string) {
    const jobs = state.imports.filter((job) => job.user_id === userId || job.user_id === demoUserId)
    logger.debug({ userId, count: jobs.length }, "List imports")
    return jobs
  },

  async listImportsForUser(userId: string) {
    const dbJobs = await listImportsFromSupabase(userId)

    if (dbJobs.length > 0) {
      logger.info({ userId, count: dbJobs.length }, "Hydrated imports from Supabase")
      state.imports = [...dbJobs, ...state.imports.filter((job) => job.user_id !== userId)]
      persistState()
      return dbJobs
    }

    const localJobs = this.listImports(userId)
    return localJobs
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
    state.imports = state.imports.map((job) => (job.id === id && job.user_id === existing.user_id ? updated : job))

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

  async listSavedRows(userId: string, importId: string) {
    const dbRows = await listSavedRowsFromSupabase(userId, importId)

    if (dbRows.length > 0) {
      logger.info({ userId, importId, count: dbRows.length }, "Hydrated saved rows from Supabase")
      state.savedRows = [...dbRows, ...state.savedRows.filter((row) => row.import_id !== importId)]
      persistState()
      return dbRows
    }

    const rows = state.savedRows.filter((row) => row.import_id === importId && (row.user_id === userId || row.user_id === demoUserId))

    if (rows.length > 0) {
      logger.debug({ userId, importId, count: rows.length, source: "local-fallback" }, "List saved rows")
      return rows
    }

    logger.debug({ userId, importId, count: 0 }, "List saved rows")
    return []
  },

  async listAllSavedRows(userId: string) {
    const dbRows = await listSavedRowsFromSupabase(userId)

    if (dbRows.length > 0) {
      logger.info({ userId, count: dbRows.length }, "Hydrated all saved rows from Supabase")
      state.savedRows = [...dbRows, ...state.savedRows.filter((row) => row.user_id !== userId)]
      persistState()
      return dbRows
    }

    const rows = state.savedRows.filter((row) => row.user_id === userId || row.user_id === demoUserId)

    if (rows.length > 0) {
      logger.debug({ userId, count: rows.length, source: "local-fallback" }, "List all saved rows")
      return rows
    }

    logger.debug({ userId, count: 0 }, "List all saved rows")
    return []
  },

  async listAllSavedRowsForUser(userId: string) {
    const rows = await this.listAllSavedRows(userId)

    if (rows.length > 0) {
      return rows
    }

    const dbRows = await listSavedRowsFromSupabase(userId)

    if (dbRows.length > 0) {
      logger.info({ userId, count: dbRows.length }, "Hydrated all saved rows from Supabase")
      state.savedRows = [...dbRows, ...state.savedRows.filter((row) => row.user_id !== userId)]
      persistState()
      return dbRows
    }

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

  async updateSavedRow(userId: string, importId: string, rowId: string, cleanedData: RowData) {
    const existing = state.savedRows.find((row) => row.id === rowId && row.user_id === userId && row.import_id === importId)

    if (!existing) {
      logger.warn({ userId, importId, rowId }, "Saved row not found for update")
      return null
    }

    const updated: SavedRow = {
      ...existing,
      cleaned_data: cleanedData,
      updated_at: new Date().toISOString(),
    }
    logger.info({ userId, rowId, importId }, "Updated saved row")
    state.savedRows = state.savedRows.map((row) =>
      row.id === rowId && row.user_id === userId && row.import_id === importId ? updated : row
    )
    persistState()
    await updateSavedRowInSupabase(userId, importId, rowId, cleanedData, updated.updated_at)
    void invalidateAnalyticsCache(importId)

    return updated
  },

  async deleteSavedRow(userId: string, importId: string, rowId: string) {
    const existing = state.savedRows.find((row) => row.id === rowId && row.user_id === userId && row.import_id === importId)

    if (!existing) {
      logger.warn({ userId, importId, rowId }, "Saved row not found for deletion")
      return false
    }

    logger.info({ userId, rowId, importId }, "Deleted saved row")
    state.savedRows = state.savedRows.filter(
      (row) => !(row.id === rowId && row.user_id === userId && row.import_id === importId)
    )
    persistState()
    await deleteSavedRowFromSupabase(userId, importId, rowId)
    void invalidateAnalyticsCache(importId)

    return true
  },

  async saveGoodRows(userId: string, importId: string, rows: CleanedRow[]) {
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
    await syncSavedRowsToSupabase(userId, importId, savedRows)
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
    delete state.userApiKeyModes[userId]
    persistState()
    logger.info({ userId }, "API key removed")
  },

  getUseUserApiKey(userId: string) {
    return state.userApiKeyModes[userId] ?? false
  },

  setUseUserApiKey(userId: string, enabled: boolean) {
    state.userApiKeyModes[userId] = enabled
    persistState()
    logger.info({ userId, enabled }, "User API key mode saved")
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

  getAiSettings(userId: string) {
    return state.userAiSettings[userId] ?? null
  },

  setAiSettings(userId: string, settings: { batchSize: number; requestBatchSize: number }) {
    state.userAiSettings[userId] = settings
    persistState()
    logger.info({ userId, settings }, "AI settings saved")
  },

  listCampaigns(userId: string) {
    return state.campaigns.filter((c) => c.user_id === userId || c.user_id === demoUserId)
  },

  createCampaign(userId: string, name: string) {
    const campaign: Campaign = {
      id: crypto.randomUUID(),
      user_id: userId,
      name,
      rowIds: [],
      created_at: new Date().toISOString(),
    }
    state.campaigns.push(campaign)
    persistState()
    logger.info({ userId, campaignId: campaign.id }, "Campaign created")
    return campaign
  },

  deleteCampaign(userId: string, campaignId: string) {
    state.campaigns = state.campaigns.filter((c) => !(c.id === campaignId && (c.user_id === userId || c.user_id === demoUserId)))
    persistState()
    logger.info({ userId, campaignId }, "Campaign deleted")
  },

  addRowToCampaign(userId: string, campaignId: string, rowId: string) {
    const campaign = state.campaigns.find((c) => c.id === campaignId && (c.user_id === userId || c.user_id === demoUserId))
    if (!campaign) return false
    if (!campaign.rowIds.includes(rowId)) {
      campaign.rowIds.push(rowId)
      persistState()
    }
    return true
  },

  removeRowFromCampaign(userId: string, campaignId: string, rowId: string) {
    const campaign = state.campaigns.find((c) => c.id === campaignId && (c.user_id === userId || c.user_id === demoUserId))
    if (!campaign) return false
    campaign.rowIds = campaign.rowIds.filter((id) => id !== rowId)
    persistState()
    return true
  },
}
