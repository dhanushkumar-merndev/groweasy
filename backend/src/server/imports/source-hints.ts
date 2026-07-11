import type { CleanedRow, RawImportRow, Template, TemplateColumn } from "../../lib/types.js"

type LearnedHints = Record<string, string[]>

export function learnTemplateSourceHints(input: {
  template: Template
  rawRows: RawImportRow[]
  cleanedRows: CleanedRow[]
}): LearnedHints {
  const rawRowsById = new Map(input.rawRows.map((row) => [row.id, row]))
  const scores = new Map<string, Map<string, number>>()
  const finalValueCounts = new Map<string, number>()

  for (const cleanedRow of input.cleanedRows) {
    if (cleanedRow.status === "skipped") {
      continue
    }

    const rawRow = rawRowsById.get(cleanedRow.id)

    if (!rawRow) {
      continue
    }

    const rawEntries = Object.entries(rawRow.raw_data ?? {})
      .map(([header, value]) => ({
        header: cleanHeader(header),
        value: normalizeValue(value),
      }))
      .filter((entry) => entry.header && entry.value)

    for (const column of input.template.columns_config) {
      const finalValue = normalizeValue(cleanedRow.cleaned_data[column.key])

      if (!finalValue) {
        continue
      }

      finalValueCounts.set(column.key, (finalValueCounts.get(column.key) ?? 0) + 1)

      for (const entry of rawEntries) {
        if (!isSafeSourceHeader(entry.header)) {
          continue
        }

        if (!valueLooksMapped(entry.value, finalValue, column, entry.header)) {
          continue
        }

        const columnScores = scores.get(column.key) ?? new Map<string, number>()
        columnScores.set(entry.header, (columnScores.get(entry.header) ?? 0) + 1)
        scores.set(column.key, columnScores)
      }
    }
  }

  return Object.fromEntries(
    input.template.columns_config
      .map((column) => {
        const columnScores = scores.get(column.key)

        if (!columnScores) {
          return [column.key, []] as const
        }

        const needed = Math.min(2, Math.max(1, finalValueCounts.get(column.key) ?? 0))
        const existing = new Set([
          normalizeHeader(column.key),
          normalizeHeader(column.label),
          ...(column.source_hints ?? []).map(normalizeHeader),
        ])
        const hints = [...columnScores.entries()]
          .filter(([header, count]) => count >= needed || headerLooksLikeColumn(header, column))
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .map(([header]) => header)
          .filter((header) => !existing.has(normalizeHeader(header)))
          .slice(0, 3)

        return [column.key, hints] as const
      })
      .filter(([, hints]) => hints.length > 0)
  )
}

function valueLooksMapped(rawValue: string, finalValue: string, column: TemplateColumn, header: string) {
  const raw = normalizeComparable(rawValue)
  const final = normalizeComparable(finalValue)

  if (!raw || !final) {
    return false
  }

  if (raw === final) {
    return true
  }

  const target = normalizeHeader(`${column.key} ${column.label}`)
  const isLongGeneratedText = target.includes("description") || target.includes("note") || target.includes("remark")

  if (isLongGeneratedText) {
    return headerLooksLikeColumn(header, column) && (raw.includes(final) || final.includes(raw))
  }

  const rawDigits = rawValue.replace(/\D/g, "")
  const finalDigits = finalValue.replace(/\D/g, "")

  if (finalDigits.length >= 6 && rawDigits.endsWith(finalDigits)) {
    return true
  }

  if (final.length >= 3 && raw.includes(final)) {
    return true
  }

  return raw.length >= 4 && final.includes(raw)
}

function headerLooksLikeColumn(header: string, column: TemplateColumn) {
  const normalizedHeader = normalizeHeader(header)
  const candidates = [
    column.key,
    column.label,
    ...(column.source_hints ?? []),
  ].map(normalizeHeader).filter(Boolean)

  return candidates.some((candidate) => normalizedHeader.includes(candidate) || candidate.includes(normalizedHeader))
}

function isSafeSourceHeader(header: string) {
  const normalized = normalizeHeader(header)

  if (!normalized) {
    return false
  }

  return !["data", "value", "values", "field", "fields", "row"].includes(normalized)
}

function cleanHeader(header: string) {
  return header.trim().replace(/\s+/g, " ").slice(0, 80)
}

function normalizeValue(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ")
}

function normalizeComparable(value: string) {
  return value.toLowerCase().replace(/[_\W]+/g, " ").trim()
}

function normalizeHeader(value: string) {
  return normalizeComparable(value)
}
