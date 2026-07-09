import type {
  AiCellChange,
  CellValue,
  CleanedRow,
  FormattingRule,
  RawImportRow,
  RowData,
  Template,
  TemplateColumn,
} from "@/lib/types"

export const DASH_ONLY_RE = /^[-_\s]+$/
export const NULLISH_RE = /^(na|n\/a|null|undefined|none)$/i

const FORMULA_LIKE_RE = /^([=+@]|-[A-Za-z(])/
const SAFE_PLUS_NUMBER_RE = /^\+\d[\d\s().-]*$/
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const INTERNATIONAL_PHONE_RE = /(?:\+|00)\s*(\d{1,3})[\s().-]*\d/

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

  if (FORMULA_LIKE_RE.test(compact) && !SAFE_PLUS_NUMBER_RE.test(compact)) {
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
        formatted = formatIndianMobileDigits(formatted)
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
    const extractedValue = extractTargetValue(rawValue, column)
    const sanitized = sanitizeCellValue(extractedValue)
    const formatted = applyFormattingRules(sanitized, column.format_rules)

    cleaned_data[column.key] = formatted

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

function extractTargetValue(value: unknown, column: TemplateColumn) {
  const target = normalizeKey(`${column.key} ${column.label}`)
  const text = value === null || value === undefined ? "" : String(value)

  if (target.includes("email")) {
    return text.match(EMAIL_RE)?.[0] ?? ""
  }

  if (target.includes("country_code") || target.includes("country code") || target.includes("dial_code")) {
    return extractCountryCode(text)
  }

  if (target.includes("mobile") || target.includes("phone") || target.includes("whatsapp")) {
    return extractMobileNumber(text)
  }

  return value
}

function extractCountryCode(value: string) {
  const plainCode = value.trim().match(/^\+?(\d{1,3})$/)

  if (plainCode?.[1]) {
    return `+${plainCode[1]}`
  }

  const match = value.match(INTERNATIONAL_PHONE_RE)

  if (match?.[1]) {
    return `+${match[1]}`
  }

  const digits = value.replace(/\D/g, "")

  if (digits.length === 12 && digits.startsWith("91")) {
    return "+91"
  }

  return ""
}

function extractMobileNumber(value: string) {
  const phoneMatch = value.match(/(?:\+|00)?\s*\d[\d\s().-]{8,}\d/)
  const digits = (phoneMatch?.[0] ?? value).replace(/\D/g, "")

  return normalizeIndianMobileDigits(digits)
}

function formatIndianMobileDigits(value: string) {
  return normalizeIndianMobileDigits(value.replace(/\D/g, ""))
}

function normalizeIndianMobileDigits(digits: string) {
  if (digits.length >= 10 && digits.length <= 14) {
    const mobile = digits.slice(-10)
    return /^[6-9]/.test(mobile) ? mobile : ""
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
