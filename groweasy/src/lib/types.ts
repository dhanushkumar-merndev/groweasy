export type CellValue = string | number | boolean | null

export type RowData = Record<string, CellValue>

export type RowStatus = "good" | "missing" | "skipped"

export type ImportStatus =
  | "uploaded"
  | "validated"
  | "processing"
  | "processed"
  | "saved"
  | "failed"

export type FormattingRule =
  | "uppercase"
  | "lowercase"
  | "title_case"
  | "align_left"
  | "align_right"
  | "align_center"
  | "last_10_digits"
  | "add_country_code_91"
  | "digits_only"
  | "today_date"
  | "time_hh_mm"
  | "time_hh_mm_ss"
  | "convert_to_ist"
  | "remove_dashes"
  | "remove_underscores"
  | "remove_dots"
  | "date_dd_mm_yyyy"
  | "dash_to_blank"
  | "blank_column"
  | "dict_lookup"
  | "dict_lookup_with_default"

export type TemplateColumn = {
  key: string
  label: string
  source_hints: string[]
  required: boolean
  format_rules: FormattingRule[]
  export_title: string
}

export type Template = {
  id: string
  user_id: string
  name: string
  columns_config: TemplateColumn[]
  formatting_rules: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type ImportSheet = {
  id: string
  import_id: string
  sheet_name: string
  sheet_index: number
  total_rows: number
  good_count: number
  missing_count: number
  skipped_count: number
  created_at: string
}

export type SheetSummary = {
  sheet_id: string
  sheet_name: string
  sheet_index: number
  total_rows: number
  good_count: number
  missing_count: number
  skipped_count: number
}

export type ImportSummary = {
  total_rows: number
  good_count: number
  missing_count: number
  skipped_count: number
  fixed_missing_count: number
  final_saved_count: number
  blank_rows_removed: number
  duplicate_count: number
  ai_changed_count: number
  missing_by_field: Record<string, number>
  sheet_summary: SheetSummary[]
}

export type ImportJob = ImportSummary & {
  id: string
  user_id: string
  template_id: string
  file_name: string
  import_name: string
  status: ImportStatus
  prompt_version: string
  model_used: string | null
  total_sheets: number
  created_at: string
  updated_at: string
}

export type RawImportRow = {
  id: string
  import_id: string
  sheet_id: string
  sheet_name: string
  sheet_index: number
  row_index: number
  raw_data: RowData
}

export type AiCellChange = {
  field: string
  before: string | null
  after: string | null
  reason: string
}

export type CleanedRow = RawImportRow & {
  cleaned_data: RowData
  status: RowStatus
  missing_fields: string[]
  skip_reason?: string
  ai_changes: AiCellChange[]
}

export type SavedRow = {
  id: string
  user_id: string
  import_id: string
  sheet_id: string | null
  sheet_name: string
  sheet_index: number
  row_index: number
  cleaned_data: RowData
  ai_changes: AiCellChange[]
  created_at: string
  updated_at: string
}

export type AiBatchResult = {
  batch_no: number
  rows: CleanedRow[]
  summary: {
    good_count: number
    missing_count: number
    skipped_count: number
    ai_changed_count: number
  }
}

export type ValidationWarning = {
  code:
    | "blank_sheet"
    | "hidden_sheet"
    | "blank_rows_removed"
    | "formula_sanitized"
    | "images_macros_ignored"
    | "too_many_rows"
    | "empty_workbook"
  message: string
  count: number
}

export type ValidationResult = {
  import_id: string
  rows: RawImportRow[]
  sheets: ImportSheet[]
  warnings: ValidationWarning[]
  blank_rows_removed: number
  total_rows: number
  remove_blank_rows?: boolean
  dash_values_blank?: boolean
  require_both_email_phone?: boolean
  generate_description?: boolean
  correct_spelling?: boolean
}

export type HistoryAction =
  | "file_uploaded"
  | "ai_processing_started"
  | "ai_processing_completed"
  | "rows_saved"
  | "rows_added"
  | "rows_deleted"
  | "export_done"
  | "google_sheet_export_done"

export type HistoryLog = {
  id: string
  user_id: string
  import_id: string
  action: HistoryAction
  meta: Record<string, unknown>
  created_at: string
}

export type ChartType =
  | "line"
  | "bar"
  | "pie"
  | "horizontal_bar"
  | "vertical_bar"
  | "area"

export type AnalyticsConfig = {
  import_id: string
  chart_type: ChartType
  title: string
  x_axis: string
  y_axis: string
  group_by?: string
  filters: Record<string, string>
}

export type CacheEnvelope<T> = {
  cached_at: string
  expires_at: string
  version: "v1"
  data: T
}

export type ApiError = {
  error: {
    code: string
    message: string
  }
}
