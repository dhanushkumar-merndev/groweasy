import { z } from "zod"
import type { ChartType, FormattingRule, RowData, RowStatus } from "../lib/types.js"

export const formattingRuleSchema = z.enum([
  "uppercase",
  "lowercase",
  "title_case",
  "align_left",
  "align_right",
  "align_center",
  "last_10_digits",
  "add_country_code_91",
  "digits_only",
  "today_date",
  "time_hh_mm",
  "time_hh_mm_ss",
  "convert_to_ist",
  "remove_dashes",
  "remove_underscores",
  "remove_dots",
  "date_dd_mm_yyyy",
  "dash_to_blank",
  "blank_column",
  "dict_lookup",
  "dict_lookup_with_default",
]) satisfies z.ZodType<FormattingRule>

export const rowStatusSchema = z.enum(["good", "missing", "skipped"]) satisfies z.ZodType<RowStatus>

const cellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

export const rowDataSchema = z.record(z.string(), cellValueSchema) satisfies z.ZodType<RowData>

export const aiCellChangeSchema = z.object({
  field: z.string(),
  before: z.string().nullable(),
  after: z.string().nullable(),
  reason: z.string(),
})

export const rawImportRowSchema = z.object({
  id: z.string().optional(),
  import_id: z.string().optional(),
  sheet_id: z.string().optional(),
  sheet_name: z.string().optional(),
  sheet_index: z.number().int().min(0).optional(),
  row_index: z.number().int().min(0).optional(),
  source_sheet: z.string().optional(),
  source_sheet_index: z.number().int().min(0).optional(),
  source_row_index: z.number().int().min(0).optional(),
  raw_data: rowDataSchema.optional(),
  data: rowDataSchema.optional(),
}).transform((row) => {
  const importId = row.import_id ?? ""
  const sheetIndex = row.sheet_index ?? row.source_sheet_index ?? 0
  const rowIndex = row.row_index ?? row.source_row_index ?? 0
  const sheetName = row.sheet_name ?? row.source_sheet ?? "Upload"

  return {
    id: row.id ?? `${importId}_${sheetIndex}_${rowIndex}`,
    import_id: importId,
    sheet_id: row.sheet_id ?? `${importId}_sheet_${sheetIndex + 1}`,
    sheet_name: sheetName,
    sheet_index: sheetIndex,
    row_index: rowIndex,
    raw_data: row.raw_data ?? row.data ?? {},
  }
})

export const cleanedRowSchema = z.object({
  id: z.string(),
  import_id: z.string(),
  sheet_id: z.string(),
  sheet_name: z.string(),
  sheet_index: z.number().int().min(0),
  row_index: z.number().int().min(0),
  raw_data: rowDataSchema,
  cleaned_data: rowDataSchema,
  status: rowStatusSchema,
  missing_fields: z.array(z.string()).default([]),
  skip_reason: z.string().optional(),
  ai_changes: z.array(aiCellChangeSchema).default([]),
})

export const templateColumnSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/),
  label: z.string().min(1),
  source_hints: z.array(z.string().min(1)).default([]),
  required: z.boolean().default(false),
  format_rules: z.array(formattingRuleSchema).default([]),
  export_title: z.string().min(1),
})

export const templateInputSchema = z.object({
  name: z.string().min(2).max(120),
  columns_config: z.array(templateColumnSchema).min(1),
  formatting_rules: z.record(z.string(), z.unknown()).default({}),
})

export const uploadOptionsSchema = z.object({
  template_id: z.string().min(1),
  remove_blank_rows: z.coerce.boolean().default(true),
  dash_values_blank: z.coerce.boolean().default(true),
})

export const processImportSchema = z.object({
  force: z.boolean().default(false),
})

export const validateImportSchema = z.object({
  rows: z.array(rawImportRowSchema).optional(),
  blank_rows_removed: z.number().int().min(0).default(0),
  remove_blank_rows: z.boolean().default(true),
  dash_values_blank: z.boolean().default(true),
  require_both_email_phone: z.boolean().default(false),
  generate_description: z.boolean().default(false),
  correct_spelling: z.boolean().default(false),
})

export const saveImportSchema = z.object({
  row_ids: z.array(z.string()).optional(),
  rows: z.array(cleanedRowSchema).optional(),
})

export const tableRowsQuerySchema = z.object({
  sheet: z.string().optional(),
  status: rowStatusSchema.optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(10000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

export const savedRowPatchSchema = z.object({
  cleaned_data: rowDataSchema,
})

export const appendRowSchema = z.object({
  sheet_name: z.string().min(1),
  sheet_index: z.number().int().min(0).default(0),
  row_index: z.number().int().min(0).default(0),
  cleaned_data: rowDataSchema,
})

export const chartTypeSchema = z.enum([
  "line",
  "bar",
  "pie",
  "horizontal_bar",
  "vertical_bar",
  "area",
]) satisfies z.ZodType<ChartType>

export const analyticsSuggestSchema = z.object({
  import_id: z.string().min(1),
  sheet: z.string().optional(),
  columns: z.array(z.string()).default([]),
  filters: z.record(z.string(), z.string()).default({}),
})

export const googleSheetImportSchema = z.object({
  spreadsheet_id: z.string().min(8),
  range: z.string().min(1).default("Sheet1"),
  template_id: z.string().min(1),
})

export const googleSheetExportSchema = z.object({
  import_id: z.string().min(1),
  spreadsheet_id: z.string().optional(),
  sheet_name: z.string().min(1).default("Cleaned Data"),
})

export const exportExcelSchema = z.object({
  mode: z.enum(["all_good", "same_tabs", "selected_sheet", "filtered", "missing_summary"]).default("all_good"),
  sheet_name: z.string().optional(),
  search: z.string().optional(),
})

export const cleanBatchTemplateColumnSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.string().min(1).default("text"),
  required: z.boolean().default(false),
})

export const cleanBatchRequestSchema = z.object({
  batch_id: z.string().min(1),
  selected_template: z.object({
    name: z.string().min(1),
    columns: z.array(cleanBatchTemplateColumnSchema).min(1),
  }),
  rows: z.array(
    z.object({
      source_sheet: z.string().min(1),
      source_sheet_index: z.number().int().min(0),
      source_row_index: z.number().int().min(1),
      data: z.record(z.string(), z.string()),
    })
  ),
})

export const cleanBatchOutputRowSchema = z.object({
  source_sheet: z.string(),
  source_sheet_index: z.number().int().min(0),
  source_row_index: z.number().int().min(1),
  status: z.enum(["good", "missing", "skipped"]),
  missing_fields: z.array(z.string()).default([]),
  skip_reason: z.string().default(""),
  cleaned_data: rowDataSchema,
  ai_changes: z.array(aiCellChangeSchema).default([]),
})

export const cleanBatchResultSchema = z.object({
  batch_id: z.string(),
  good_rows: z.array(cleanBatchOutputRowSchema),
  missing_rows: z.array(cleanBatchOutputRowSchema),
  skipped_rows: z.array(cleanBatchOutputRowSchema),
  summary: z.object({
    total_input_rows: z.number().int().min(0),
    good_count: z.number().int().min(0),
    missing_count: z.number().int().min(0),
    skipped_count: z.number().int().min(0),
    ai_changed_row_count: z.number().int().min(0),
    ai_changed_cell_count: z.number().int().min(0),
    missing_by_field: z.record(z.string(), z.number().int().min(0)),
    skipped_by_reason: z.record(z.string(), z.number().int().min(0)),
  }),
})
