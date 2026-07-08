import type {
  CleanedRow,
  HistoryLog,
  ImportJob,
  ImportSheet,
  SavedRow,
  Template,
} from "@/lib/types"

const now = new Date().toISOString()

export const demoUserId = "demo-user"

export const sampleTemplates: Template[] = [
  {
    id: "tpl_leads",
    user_id: demoUserId,
    name: "Lead Cleaning Template",
    columns_config: [
      {
        key: "customer_name",
        label: "Customer Name",
        source_hints: ["name", "full name", "lead name", "customer"],
        required: true,
        format_rules: ["trim", "title_case", "dash_to_blank"].filter(
          (rule): rule is "title_case" | "dash_to_blank" => rule !== "trim"
        ),
        export_title: "CUSTOMER NAME",
      },
      {
        key: "mobile",
        label: "Mobile",
        source_hints: ["phone", "mobile", "contact", "number"],
        required: true,
        format_rules: ["digits_only", "last_10_digits"],
        export_title: "MOBILE",
      },
      {
        key: "city",
        label: "City",
        source_hints: ["city", "location", "area"],
        required: false,
        format_rules: ["title_case", "dash_to_blank"],
        export_title: "CITY",
      },
      {
        key: "source",
        label: "Source",
        source_hints: ["source", "campaign", "platform"],
        required: false,
        format_rules: ["title_case"],
        export_title: "SOURCE",
      },
      {
        key: "created_date",
        label: "Created Date",
        source_hints: ["date", "created", "lead date"],
        required: false,
        format_rules: ["date_dd_mm_yyyy"],
        export_title: "CREATED DATE",
      },
    ],
    formatting_rules: {},
    created_at: now,
    updated_at: now,
  },
  {
    id: "tpl_sales",
    user_id: demoUserId,
    name: "Sales Follow-up Template",
    columns_config: [
      {
        key: "account_name",
        label: "Account Name",
        source_hints: ["account", "company", "business"],
        required: true,
        format_rules: ["title_case"],
        export_title: "ACCOUNT NAME",
      },
      {
        key: "owner",
        label: "Owner",
        source_hints: ["owner", "agent", "sales person"],
        required: true,
        format_rules: ["title_case"],
        export_title: "OWNER",
      },
      {
        key: "stage",
        label: "Stage",
        source_hints: ["stage", "status"],
        required: false,
        format_rules: ["title_case"],
        export_title: "STAGE",
      },
    ],
    formatting_rules: {},
    created_at: now,
    updated_at: now,
  },
]

export const sampleImport: ImportJob = {
  id: "imp_demo",
  user_id: demoUserId,
  template_id: "tpl_leads",
  file_name: "July Leads.xlsx",
  import_name: "July Leads",
  status: "saved",
  prompt_version: "excel-cleaner-v1",
  model_used: "demo-local-cleaner",
  total_sheets: 2,
  total_rows: 12,
  good_count: 8,
  missing_count: 3,
  skipped_count: 1,
  fixed_missing_count: 1,
  final_saved_count: 9,
  blank_rows_removed: 4,
  duplicate_count: 0,
  ai_changed_count: 17,
  missing_by_field: { mobile: 2, customer_name: 1 },
  sheet_summary: [
    {
      sheet_id: "sheet_demo_1",
      sheet_name: "Facebook Leads",
      sheet_index: 0,
      total_rows: 7,
      good_count: 5,
      missing_count: 2,
      skipped_count: 0,
    },
    {
      sheet_id: "sheet_demo_2",
      sheet_name: "Google Leads",
      sheet_index: 1,
      total_rows: 5,
      good_count: 3,
      missing_count: 1,
      skipped_count: 1,
    },
  ],
  created_at: now,
  updated_at: now,
}

export const sampleSheets: ImportSheet[] = sampleImport.sheet_summary.map((sheet) => ({
  id: sheet.sheet_id,
  import_id: sampleImport.id,
  sheet_name: sheet.sheet_name,
  sheet_index: sheet.sheet_index,
  total_rows: sheet.total_rows,
  good_count: sheet.good_count,
  missing_count: sheet.missing_count,
  skipped_count: sheet.skipped_count,
  created_at: now,
}))

export const sampleCleanedRows: CleanedRow[] = [
  {
    id: "row_1",
    import_id: "imp_demo",
    sheet_id: "sheet_demo_1",
    sheet_name: "Facebook Leads",
    sheet_index: 0,
    row_index: 1,
    raw_data: { Name: "  anjali  sharma", Phone: "+91 98765-43210", City: "bangalore", Source: "facebook" },
    cleaned_data: { customer_name: "Anjali Sharma", mobile: "9876543210", city: "Bangalore", source: "Facebook", created_date: "08/07/2026" },
    status: "good",
    missing_fields: [],
    ai_changes: [
      { field: "customer_name", before: "  anjali  sharma", after: "Anjali Sharma", reason: "Trimmed spacing and applied title case." },
      { field: "mobile", before: "+91 98765-43210", after: "9876543210", reason: "Kept the last 10 digits." },
    ],
  },
  {
    id: "row_2",
    import_id: "imp_demo",
    sheet_id: "sheet_demo_1",
    sheet_name: "Facebook Leads",
    sheet_index: 0,
    row_index: 2,
    raw_data: { Name: "rahul", Phone: "N/A", City: "mumbai", Source: "fb ads" },
    cleaned_data: { customer_name: "Rahul", mobile: "", city: "Mumbai", source: "Fb Ads", created_date: "08/07/2026" },
    status: "missing",
    missing_fields: ["mobile"],
    ai_changes: [{ field: "mobile", before: "N/A", after: "", reason: "Null-like value converted to blank." }],
  },
  {
    id: "row_3",
    import_id: "imp_demo",
    sheet_id: "sheet_demo_2",
    sheet_name: "Google Leads",
    sheet_index: 1,
    row_index: 3,
    raw_data: { Name: "meera iyer", Phone: "9123456780", City: "chennai", Source: "google" },
    cleaned_data: { customer_name: "Meera Iyer", mobile: "9123456780", city: "Chennai", source: "Google", created_date: "08/07/2026" },
    status: "good",
    missing_fields: [],
    ai_changes: [{ field: "customer_name", before: "meera iyer", after: "Meera Iyer", reason: "Applied title case." }],
  },
  {
    id: "row_4",
    import_id: "imp_demo",
    sheet_id: "sheet_demo_2",
    sheet_name: "Google Leads",
    sheet_index: 1,
    row_index: 4,
    raw_data: { Name: "", Phone: "", City: "", Source: "" },
    cleaned_data: {},
    status: "skipped",
    missing_fields: [],
    skip_reason: "No useful data after deterministic cleanup.",
    ai_changes: [],
  },
]

export const sampleSavedRows: SavedRow[] = sampleCleanedRows
  .filter((row) => row.status === "good")
  .map((row) => ({
    id: `saved_${row.id}`,
    user_id: demoUserId,
    import_id: row.import_id,
    sheet_id: row.sheet_id,
    sheet_name: row.sheet_name,
    sheet_index: row.sheet_index,
    row_index: row.row_index,
    cleaned_data: row.cleaned_data,
    ai_changes: row.ai_changes,
    created_at: now,
    updated_at: now,
  }))

export const sampleHistory: HistoryLog[] = [
  {
    id: "hist_1",
    user_id: demoUserId,
    import_id: sampleImport.id,
    action: "file_uploaded",
    meta: {
      file_name: sampleImport.file_name,
      template_name: "Lead Cleaning Template",
      total_rows: sampleImport.total_rows,
    },
    created_at: now,
  },
  {
    id: "hist_2",
    user_id: demoUserId,
    import_id: sampleImport.id,
    action: "rows_saved",
    meta: {
      saved_rows: sampleImport.final_saved_count,
      missing_rows: sampleImport.missing_count,
      skipped_rows: sampleImport.skipped_count,
      fixed_missing_rows: sampleImport.fixed_missing_count,
    },
    created_at: now,
  },
]
