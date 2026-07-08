import type {
  AiCellChange,
  CellValue,
  CleanedRow,
  FormattingRule,
  RawImportRow,
  RowData,
  Template,
  TemplateColumn,
} from "../lib/types.js"

export const DASH_ONLY_RE = /^[-_\s]+$/
export const NULLISH_RE = /^(na|n\/a|null|undefined|none)$/i

const FORMULA_LIKE_RE = /^([=+@]|-[A-Za-z(])/

export function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

export function sanitizeCellValue(value: unknown, dashValuesBlank = true): CellValue {
  if (value === null || value === undefined) {
    return ""
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value
  }

  const compact = String(value).replace(/\s+/g, " ").trim()

  if (!compact) {
    return ""
  }

  if (dashValuesBlank && (DASH_ONLY_RE.test(compact) || NULLISH_RE.test(compact))) {
    return ""
  }

  if (FORMULA_LIKE_RE.test(compact)) {
    return `'${compact}`
  }

  return compact
}

export function hasUsefulData(row: RowData) {
  return Object.values(row).some((value) => {
    if (value === null || value === undefined) {
      return false
    }

    return String(value).trim().length > 0
  })
}

export function applyFormattingRules(value: CellValue, rules: FormattingRule[]) {
  let formatted = value === null || value === undefined ? "" : String(value)

  for (const rule of rules) {
    switch (rule) {
      case "uppercase":
        formatted = formatted.toUpperCase()
        break
      case "lowercase":
        formatted = formatted.toLowerCase()
        break
      case "title_case":
        formatted = formatted
          .toLowerCase()
          .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase())
        break
      case "last_10_digits":
        formatted = formatted.replace(/\D/g, "").slice(-10)
        break
      case "add_country_code_91":
        formatted = formatted && !formatted.startsWith("+91") ? `+91${formatted}` : formatted
        break
      case "digits_only":
        formatted = formatted.replace(/\D/g, "")
        break
      case "today_date":
        formatted = new Intl.DateTimeFormat("en-GB").format(new Date())
        break
      case "time_hh_mm":
        formatted = new Intl.DateTimeFormat("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "Asia/Kolkata",
        }).format(new Date())
        break
      case "time_hh_mm_ss":
        formatted = new Intl.DateTimeFormat("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: "Asia/Kolkata",
        }).format(new Date())
        break
      case "convert_to_ist":
        formatted = formatted ? `${formatted} IST` : formatted
        break
      case "remove_dashes":
        formatted = formatted.replace(/-/g, "")
        break
      case "remove_underscores":
        formatted = formatted.replace(/_/g, "")
        break
      case "remove_dots":
        formatted = formatted.replace(/\./g, "")
        break
      case "date_dd_mm_yyyy":
        formatted = formatDateLikeValue(formatted)
        break
      case "dash_to_blank":
        formatted = DASH_ONLY_RE.test(formatted) || NULLISH_RE.test(formatted) ? "" : formatted
        break
      case "blank_column":
        formatted = ""
        break
      case "dict_lookup":
      case "dict_lookup_with_default":
      case "align_left":
      case "align_right":
      case "align_center":
        break
    }
  }

  return formatted.trim()
}

export function cleanRowsWithTemplate(rows: RawImportRow[], template: Template): CleanedRow[] {
  return rows.map((row) => cleanRowWithTemplate(row, template))
}

export function cleanRowWithTemplate(row: RawImportRow, template: Template): CleanedRow {
  const cleaned_data: RowData = {}
  const ai_changes: AiCellChange[] = []
  const missing_fields: string[] = []

  if (!hasUsefulData(row.raw_data)) {
    return {
      ...row,
      cleaned_data,
      status: "skipped",
      missing_fields,
      skip_reason: "No useful data after deterministic cleanup.",
      ai_changes,
    }
  }

  for (const column of template.columns_config) {
    const rawValue = findSourceValue(row.raw_data, column)
    const sanitized = sanitizeCellValue(rawValue)
    const formatted = applyFormattingRules(sanitized, column.format_rules)

    cleaned_data[column.key] = formatted

    if (String(sanitized ?? "") !== formatted) {
      ai_changes.push({
        field: column.key,
        before: sanitized === null || sanitized === undefined ? null : String(sanitized),
        after: formatted || null,
        reason: "Applied deterministic template formatting before AI review.",
      })
    }

    if (column.required && !formatted) {
      missing_fields.push(column.key)
    }
  }

  const mappedValues = Object.values(cleaned_data).filter((value) => String(value ?? "").trim())

  if (mappedValues.length === 0) {
    return {
      ...row,
      cleaned_data,
      status: "skipped",
      missing_fields: [],
      skip_reason: "Could not map any meaningful value to the selected template.",
      ai_changes,
    }
  }

  return {
    ...row,
    cleaned_data,
    status: missing_fields.length > 0 ? "missing" : "good",
    missing_fields,
    ai_changes,
  }
}

function findSourceValue(row: RowData, column: TemplateColumn) {
  const candidates = new Set([
    normalizeKey(column.key),
    normalizeKey(column.label),
    ...column.source_hints.map(normalizeKey),
  ])

  for (const [key, value] of Object.entries(row)) {
    const normalized = normalizeKey(key)

    if (candidates.has(normalized)) {
      return value
    }
  }

  for (const [key, value] of Object.entries(row)) {
    const normalized = normalizeKey(key)

    if ([...candidates].some((candidate) => normalized.includes(candidate) || candidate.includes(normalized))) {
      return value
    }
  }

  return ""
}

function formatDateLikeValue(value: string) {
  if (!value) {
    return ""
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat("en-GB").format(parsed)
}
