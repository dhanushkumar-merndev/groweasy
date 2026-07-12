import {
  defaultTemplateId,
  systemUserId,
  defaultTemplate,
} from "../../lib/default-template.js"
import type {
  Campaign,
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
import { invalidateAnalyticsCache, invalidateImportCache, cacheKeys, getCache, setCache } from "../redis/cache.js"
import { logger } from "../../lib/logger.js"
import { addHistoryEntry, listHistoryEntries } from "../db/db-history.js"
import { getSupabaseServiceClient } from "../db/supabase.js"

// ── Shared Normalizers ──────────────────────────────────────────────────

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

function normalizeCampaignRow(row: Record<string, any>): Campaign {
  const now = new Date().toISOString()

  return {
    id: String(row.id),
    user_id: String(row.user_id ?? ""),
    name: String(row.name ?? "Untitled campaign"),
    rowIds: Array.isArray(row.row_ids) ? row.row_ids.map(String) : [],
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

function isUuid(value: string | null | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
}

// ── Template Helpers ────────────────────────────────────────────────────

async function listTemplatesFromSupabase(userId: string) {
  const supabase = getSupabaseServiceClient()
  if (!supabase) return []

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
  if (!supabase) return null

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
  if (!supabase) return

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
  if (!supabase) return false

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

async function ensureTemplateInSupabase(userId: string, templateId: string) {
  const supabase = getSupabaseServiceClient()
  if (!supabase) return

  const template = await getTemplateFromSupabase(userId, templateId)
    ?? (defaultTemplate.id === templateId ? defaultTemplate : null)

  if (!template) {
    logger.warn({ templateId }, "Cannot sync import because template is missing")
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

// ── Import Helpers ──────────────────────────────────────────────────────

async function listImportsFromSupabase(userId: string) {
  const supabase = getSupabaseServiceClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from("imports")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })

  if (error) {
    logger.warn({ error, userId }, "Failed to load imports from Supabase")
    return []
  }

  return (data ?? []).map(normalizeImportRow)
}

async function getImportFromSupabase(userId: string, importId: string) {
  const supabase = getSupabaseServiceClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from("imports")
    .select("*")
    .eq("id", importId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    logger.warn({ error, userId, importId }, "Failed to load import from Supabase")
    return null
  }

  return data ? normalizeImportRow(data) : null
}

async function upsertImportToSupabase(importJob: ImportJob) {
  const supabase = getSupabaseServiceClient()
  if (!supabase) return

  const { error } = await supabase
    .from("imports")
    .upsert({
      id: importJob.id,
      user_id: importJob.user_id,
      template_id: importJob.template_id,
      file_name: importJob.file_name,
      import_name: importJob.import_name,
      status: importJob.status,
      prompt_version: importJob.prompt_version,
      model_used: importJob.model_used,
      total_sheets: importJob.total_sheets,
      total_rows: importJob.total_rows,
      good_count: importJob.good_count,
      missing_count: importJob.missing_count,
      skipped_count: importJob.skipped_count,
      fixed_missing_count: importJob.fixed_missing_count,
      final_saved_count: importJob.final_saved_count,
      blank_rows_removed: importJob.blank_rows_removed,
      duplicate_count: importJob.duplicate_count,
      ai_changed_count: importJob.ai_changed_count,
      missing_by_field: importJob.missing_by_field,
      sheet_summary: importJob.sheet_summary,
      created_at: importJob.created_at,
      updated_at: importJob.updated_at,
    }, { onConflict: "id" })

  if (error) {
    logger.error({ error, importId: importJob.id }, "Failed to upsert import to Supabase")
    throw error
  }
}

// ── Sheet Helpers ───────────────────────────────────────────────────────

async function listSheetsFromSupabase(importId: string) {
  const supabase = getSupabaseServiceClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from("import_sheets")
    .select("*")
    .eq("import_id", importId)
    .order("sheet_index", { ascending: true })

  if (error) {
    logger.warn({ error, importId }, "Failed to load sheets from Supabase")
    return []
  }

  return (data ?? []).map((row): ImportSheet => ({
    id: String(row.id),
    import_id: String(row.import_id),
    sheet_name: String(row.sheet_name),
    sheet_index: numberOr(row.sheet_index, 0),
    total_rows: numberOr(row.total_rows, 0),
    good_count: numberOr(row.good_count, 0),
    missing_count: numberOr(row.missing_count, 0),
    skipped_count: numberOr(row.skipped_count, 0),
    created_at: String(row.created_at ?? new Date().toISOString()),
  }))
}

async function syncSheetsToSupabase(importId: string, sheets: ImportSheet[]) {
  const supabase = getSupabaseServiceClient()
  if (!supabase) return

  const { error: deleteError } = await supabase
    .from("import_sheets")
    .delete()
    .eq("import_id", importId)

  if (deleteError) {
    logger.warn({ error: deleteError, importId }, "Failed to clear sheets before sync")
    throw deleteError
  }

  if (sheets.length === 0) return

  const { error: insertError } = await supabase
    .from("import_sheets")
    .insert(sheets.map((sheet) => ({
      id: sheet.id,
      import_id: sheet.import_id,
      sheet_name: sheet.sheet_name,
      sheet_index: sheet.sheet_index,
      total_rows: sheet.total_rows,
      good_count: sheet.good_count,
      missing_count: sheet.missing_count,
      skipped_count: sheet.skipped_count,
      created_at: sheet.created_at,
    })))

  if (insertError) {
    logger.warn({ error: insertError, importId }, "Failed to sync sheets to Supabase")
    throw insertError
  }
}

// ── Saved Row Helpers ───────────────────────────────────────────────────

async function listSavedRowsFromSupabase(userId: string, importId?: string) {
  const supabase = getSupabaseServiceClient()
  if (!supabase) return []

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

  return (data ?? []).map(normalizeSavedRow)
}

async function syncSavedRowsToSupabase(userId: string, importId: string, savedRows: SavedRow[]) {
  const supabase = getSupabaseServiceClient()
  if (!supabase) return

  const job = await getImportFromSupabase(userId, importId)
  const templateId = job?.template_id ?? defaultTemplateId
  const now = new Date().toISOString()

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

  if (importError) throw importError

  const { error: deleteError } = await supabase
    .from("saved_rows")
    .delete()
    .eq("user_id", userId)
    .eq("import_id", importId)

  if (deleteError) throw deleteError

  if (savedRows.length === 0) return

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

  if (insertError) throw insertError

  logger.info({ importId, savedCount: savedRows.length }, "Saved rows synced to Supabase")
}

async function updateSavedRowInSupabase(
  userId: string,
  importId: string,
  rowId: string,
  cleanedData: RowData,
  updatedAt: string,
) {
  const supabase = getSupabaseServiceClient()
  if (!supabase) return

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
  if (!supabase) return

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

// ── Campaign Helpers ────────────────────────────────────────────────────

async function listCampaignsFromSupabase(userId: string) {
  const supabase = getSupabaseServiceClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) {
    logger.warn({ error, userId }, "Failed to load campaigns from Supabase")
    return []
  }

  return (data ?? []).map(normalizeCampaignRow)
}

// ── Store ───────────────────────────────────────────────────────────────

export const store = {
  // ── Templates ───────────────────────────────────────────────────

  async listTemplates(userId: string) {
    const dbTemplates = await listTemplatesFromSupabase(userId)

    return [...dbTemplates, defaultTemplate]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  },

  async listTemplatesForUser(userId: string) {
    return this.listTemplates(userId)
  },

  async getTemplate(userId: string, id: string) {
    if (id === defaultTemplateId) {
      const templates = await this.listTemplates(userId)
      return templates.find((t) => t.id === id) ?? null
    }

    return getTemplateFromSupabase(userId, id)
  },

  async getTemplateForUser(userId: string, id: string) {
    return this.getTemplate(userId, id)
  },

  async upsertTemplate(userId: string, input: Omit<Template, "user_id" | "created_at" | "updated_at"> & Partial<Pick<Template, "created_at" | "updated_at">>) {
    const now = new Date().toISOString()
    const existing = input.id ? await getTemplateFromSupabase(userId, input.id) : null
    const template: Template = {
      ...input,
      user_id: userId,
      created_at: input.created_at ?? existing?.created_at ?? now,
      updated_at: now,
    }

    await syncTemplateToSupabase(template)
    logger.info({ userId, templateId: template.id, action: existing ? "updated" : "created" }, "Template saved")

    return template
  },

  async upsertTemplateForUser(userId: string, input: Omit<Template, "user_id" | "created_at" | "updated_at"> & Partial<Pick<Template, "created_at" | "updated_at">>) {
    return this.upsertTemplate(userId, input)
  },

  async addTemplateSourceHints(userId: string, templateId: string, hintsByColumnKey: Record<string, string[]>) {
    const existing = await getTemplateFromSupabase(userId, templateId)

    if (!existing) {
      logger.debug({ userId, templateId }, "Template not eligible for learned source hints")
      return null
    }

    let added = 0
    const now = new Date().toISOString()
    const columns_config = existing.columns_config.map((column) => {
      const learnedHints = hintsByColumnKey[column.key] ?? []
      if (learnedHints.length === 0) return column

      const currentHints = column.source_hints ?? []
      const seen = new Set(currentHints.map((h) => h.trim().toLowerCase()))
      const nextHints = [...currentHints]

      for (const hint of learnedHints) {
        const normalized = hint.trim().toLowerCase()
        if (!normalized || seen.has(normalized)) continue
        seen.add(normalized)
        nextHints.push(hint)
        added += 1
      }

      return { ...column, source_hints: nextHints.slice(0, 24) }
    })

    if (added === 0) return existing

    const updated: Template = {
      ...existing,
      columns_config,
      updated_at: now,
    }

    await syncTemplateToSupabase(updated)
    logger.info({ userId, templateId, added }, "Learned source hints added to template")

    return updated
  },

  async deleteTemplate(userId: string, id: string) {
    const deleted = await deleteTemplateFromSupabase(userId, id)
    logger.info({ userId, templateId: id, deleted }, "Delete template")
    return deleted
  },

  async deleteTemplateForUser(userId: string, id: string) {
    return this.deleteTemplate(userId, id)
  },

  // ── Imports ─────────────────────────────────────────────────────

  async listImports(userId: string) {
    return listImportsFromSupabase(userId)
  },

  async listImportsForUser(userId: string) {
    return this.listImports(userId)
  },

  async getImport(userId: string, id: string) {
    return getImportFromSupabase(userId, id)
  },

  async createImport(userId: string, input: {
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

    await upsertImportToSupabase(job)
    await syncSheetsToSupabase(input.id, input.sheets)
    await this.addHistory(userId, input.id, "file_uploaded", {
      file_name: input.fileName,
      total_rows: input.rows.length,
    })

    logger.info({ userId, importId: input.id, fileName: input.fileName, totalRows: input.rows.length }, "Import created")
    return job
  },

  async updateImport(userId: string, id: string, patch: Partial<ImportJob>) {
    const existing = await getImportFromSupabase(userId, id)
    if (!existing) return null

    const updated: ImportJob = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    }

    await upsertImportToSupabase(updated)
    logger.debug({ userId, importId: id, patchKeys: Object.keys(patch) }, "Import updated")
    return updated
  },

  async setStatus(userId: string, id: string, status: ImportStatus) {
    return this.updateImport(userId, id, { status })
  },

  // ── Sheets ──────────────────────────────────────────────────────

  async listSheets(importId: string) {
    return listSheetsFromSupabase(importId)
  },

  async setSheets(importId: string, sheets: ImportSheet[]) {
    await syncSheetsToSupabase(importId, sheets)
    logger.info({ importId, count: sheets.length }, "Setting sheets")
  },

  // ── Cleaned Rows (transient — Redis only) ───────────────────────

  async setCleanedRows(importId: string, rows: CleanedRow[]) {
    await setCache(cacheKeys(importId).formatted, rows)
    logger.info({ importId, count: rows.length }, "Setting cleaned rows")
  },

  async listCleanedRows(importId: string) {
    const rows = await getCache<CleanedRow[]>(cacheKeys(importId).formatted)
    logger.debug({ importId, count: rows?.length ?? 0 }, "List cleaned rows")
    return rows ?? []
  },

  // ── Saved Rows ──────────────────────────────────────────────────

  async listSavedRows(userId: string, importId: string) {
    return listSavedRowsFromSupabase(userId, importId)
  },

  async listAllSavedRows(userId: string) {
    return listSavedRowsFromSupabase(userId)
  },

  async listAllSavedRowsForUser(userId: string) {
    return this.listAllSavedRows(userId)
  },

  async appendSavedRow(userId: string, importId: string, input: {
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

    const supabase = getSupabaseServiceClient()
    if (supabase) {
      const { error } = await supabase
        .from("saved_rows")
        .insert({
          id: row.id,
          user_id: row.user_id,
          import_id: row.import_id,
          sheet_id: null,
          sheet_name: row.sheet_name,
          sheet_index: row.sheet_index,
          row_index: row.row_index,
          cleaned_data: row.cleaned_data,
          ai_changes: row.ai_changes,
          created_at: row.created_at,
          updated_at: row.updated_at,
        })

      if (error) {
        logger.error({ error, userId, importId }, "Failed to append saved row to Supabase")
        throw error
      }
    }

    logger.info({ userId, importId, rowId: row.id }, "Appended saved row")
    void invalidateAnalyticsCache(importId)

    return row
  },

  async updateSavedRow(userId: string, importId: string, rowId: string, cleanedData: RowData) {
    const rows = await listSavedRowsFromSupabase(userId, importId)
    const existing = rows.find((row) => row.id === rowId)

    if (!existing) {
      logger.warn({ userId, importId, rowId }, "Saved row not found for update")
      return null
    }

    const updated: SavedRow = {
      ...existing,
      cleaned_data: cleanedData,
      updated_at: new Date().toISOString(),
    }

    await updateSavedRowInSupabase(userId, importId, rowId, cleanedData, updated.updated_at)
    void invalidateAnalyticsCache(importId)
    logger.info({ userId, rowId, importId }, "Updated saved row")

    return updated
  },

  async deleteSavedRow(userId: string, importId: string, rowId: string) {
    const rows = await listSavedRowsFromSupabase(userId, importId)
    const existing = rows.find((row) => row.id === rowId)

    if (!existing) {
      logger.warn({ userId, importId, rowId }, "Saved row not found for deletion")
      return false
    }

    await deleteSavedRowFromSupabase(userId, importId, rowId)
    void invalidateAnalyticsCache(importId)
    logger.info({ userId, rowId, importId }, "Deleted saved row")

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

    await syncSavedRowsToSupabase(userId, importId, savedRows)
    void invalidateImportCache(importId)
    await this.addHistory(userId, importId, "rows_saved", {
      saved_rows: savedRows.length,
      missing_rows: rows.filter((row) => row.status === "missing").length,
      skipped_rows: rows.filter((row) => row.status === "skipped").length,
    })

    logger.info({ userId, importId, savedCount: savedRows.length }, "Saving good rows")
    return savedRows
  },

  // ── History ─────────────────────────────────────────────────────

  async listHistory(userId: string) {
    const entries = await listHistoryEntries(userId)
    return entries ?? []
  },

  async addHistory(userId: string, importId: string, action: HistoryAction, meta: Record<string, unknown>) {
    const entry: HistoryLog = {
      id: crypto.randomUUID(),
      user_id: userId,
      import_id: importId,
      action,
      meta,
      created_at: new Date().toISOString(),
    }

    await addHistoryEntry(userId, importId, action, meta)
    logger.info({ userId, importId, action }, "History entry added")
    return entry
  },

  // ── Campaigns ───────────────────────────────────────────────────

  async listCampaigns(userId: string) {
    return listCampaignsFromSupabase(userId)
  },

  async createCampaign(userId: string, name: string) {
    const supabase = getSupabaseServiceClient()
    if (!supabase) throw new Error("Supabase not configured")

    const campaign: Campaign = {
      id: crypto.randomUUID(),
      user_id: userId,
      name,
      rowIds: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from("campaigns")
      .insert({
        id: campaign.id,
        user_id: campaign.user_id,
        name: campaign.name,
        row_ids: campaign.rowIds,
        created_at: campaign.created_at,
        updated_at: campaign.updated_at,
      })

    if (error) {
      logger.error({ error, userId }, "Failed to create campaign in Supabase")
      throw error
    }

    logger.info({ userId, campaignId: campaign.id }, "Campaign created")
    return campaign
  },

  async deleteCampaign(userId: string, campaignId: string) {
    const supabase = getSupabaseServiceClient()
    if (!supabase) return

    const { error } = await supabase
      .from("campaigns")
      .delete()
      .eq("id", campaignId)
      .eq("user_id", userId)

    if (error) {
      logger.error({ error, userId, campaignId }, "Failed to delete campaign from Supabase")
      throw error
    }

    logger.info({ userId, campaignId }, "Campaign deleted")
  },

  async addRowToCampaign(userId: string, campaignId: string, rowId: string) {
    const supabase = getSupabaseServiceClient()
    if (!supabase) return false

    const { data, error } = await supabase
      .from("campaigns")
      .select("row_ids")
      .eq("id", campaignId)
      .eq("user_id", userId)
      .maybeSingle()

    if (error || !data) return false

    const rowIds: string[] = Array.isArray(data.row_ids) ? data.row_ids.map(String) : []
    if (rowIds.includes(rowId)) return true

    rowIds.push(rowId)

    const { error: updateError } = await supabase
      .from("campaigns")
      .update({ row_ids: rowIds, updated_at: new Date().toISOString() })
      .eq("id", campaignId)
      .eq("user_id", userId)

    if (updateError) {
      logger.error({ error: updateError, campaignId }, "Failed to add row to campaign")
      throw updateError
    }

    return true
  },

  async removeRowFromCampaign(userId: string, campaignId: string, rowId: string) {
    const supabase = getSupabaseServiceClient()
    if (!supabase) return false

    const { data, error } = await supabase
      .from("campaigns")
      .select("row_ids")
      .eq("id", campaignId)
      .eq("user_id", userId)
      .maybeSingle()

    if (error || !data) return false

    const rowIds: string[] = Array.isArray(data.row_ids) ? data.row_ids.map(String) : []

    const { error: updateError } = await supabase
      .from("campaigns")
      .update({ row_ids: rowIds.filter((id) => id !== rowId), updated_at: new Date().toISOString() })
      .eq("id", campaignId)
      .eq("user_id", userId)

    if (updateError) {
      logger.error({ error: updateError, campaignId }, "Failed to remove row from campaign")
      throw updateError
    }

    return true
  },
}
