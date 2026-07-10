import { Router } from "express"
import { z } from "zod"

import { cleanBatchRequestSchema, cleanBatchResultSchema } from "../lib/schemas.js"
import { normalizeKey } from "../lib/formatting.js"
import { handleRouteError, jsonOk, parseJsonBody } from "../server/api.js"
import { requireCurrentUser } from "../middleware/auth.js"
import { getUserDecryptedKey, shouldUseUserApiKey } from "./settings.js"
import { logger } from "../lib/logger.js"

type CleanBatchRequest = z.infer<typeof cleanBatchRequestSchema>
type CleanBatchResult = z.infer<typeof cleanBatchResultSchema>
type CleanBatchRow = CleanBatchResult["good_rows"][number]
type CleanBatchTemplateColumn = CleanBatchRequest["selected_template"]["columns"][number]
type FieldMap = Record<string, string | string[]>

type GroqChatResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

const router = Router()
const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions"
const MAX_MAPPING_SAMPLE_ROWS = 10
const MAX_MAPPING_OUTPUT_TOKENS = 1024
const AI_RETRY_ROWS_LIMIT = clampNumber(Number(process.env.GROQ_RETRY_FAILED_ROWS_LIMIT ?? 100), 0, 500, 100)
const AI_RETRY_CHUNK_SIZE = 8

const mappingSystemPrompt = `
You map messy spreadsheet headers to a selected clean output template.
Return ONLY JSON. No markdown, no comments.
Use only selected_template.columns keys as target values.
Return schema: {"field_map":{"Raw Header":"template_key_or_array_of_template_keys"}}
Map combined fields to arrays when needed, for example Contact Details -> ["email","country_code","mobile_without_country_code"].
Do not clean row values. Do not classify rows. Do not invent target keys.
`.trim()

const retrySystemPrompt = `
You clean only the failed or unclear rows provided by the backend.
Return ONLY JSON. No markdown, no comments.
Use selected_template.columns exactly. Do not invent data.
Each input row must appear exactly once in good_rows, missing_rows, or skipped_rows.
Preserve source_sheet, source_sheet_index, and source_row_index exactly.
Return the same clean batch schema with batch_id, good_rows, missing_rows, skipped_rows, and summary.
`.trim()

router.post("/", async (req, res) => {
  try {
    const user = await requireCurrentUser(req)

    const batch = parseJsonBody(req.body, cleanBatchRequestSchema)
    logger.info({ batchId: batch.batch_id, rowCount: batch.rows.length }, "Clean batch request received")

    const userKey = await shouldUseUserApiKey(user.id) ? await getUserDecryptedKey(user.id) : null
    const apiKeys = userKey ? [userKey.key, ...getGroqApiKeys()] : getGroqApiKeys()
    const fieldMap = await inferFieldMap(batch, apiKeys)
    const deterministicResult = cleanRowsWithFieldMap(batch, fieldMap)
    const result = await retryUnclearRowsWithGroq(batch, deterministicResult, fieldMap, apiKeys)

    logger.info({ batchId: batch.batch_id, summary: result.summary }, "Clean batch completed")
    return jsonOk(res, cleanBatchResultSchema.parse(result))
  } catch (error) {
    if (error instanceof CleanBatchError) {
      logger.error({ code: error.code, status: error.status, details: error.details }, "Clean batch error")
      return res.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
        },
      })
    }

    return handleRouteError(res, error)
  }
})

async function inferFieldMap(batch: CleanBatchRequest, apiKeys: string[]): Promise<FieldMap> {
  const fallbackMap = buildHeuristicFieldMap(batch)

  if (apiKeys.length === 0) {
    logger.debug("No Groq API keys, using heuristic field map")
    return fallbackMap
  }

  const mappingPayload = buildMappingPayload(batch)

  for (const [keyIndex, apiKey] of apiKeys.entries()) {
    try {
      logger.debug({ keyIndex }, "Attempting Groq field map inference")
      const response = await requestGroqJson({
        apiKey,
        keyIndex,
        systemPrompt: mappingSystemPrompt,
        payload: mappingPayload,
        maxTokens: MAX_MAPPING_OUTPUT_TOKENS,
      })
      const parsed = fieldMapResponseSchema.parse(response)

      logger.info("Field map inferred via Groq")
      return {
        ...fallbackMap,
        ...sanitizeFieldMap(parsed.field_map, batch),
      }
    } catch {
      logger.warn({ keyIndex }, "Groq field map inference failed, trying next key")
      continue
    }
  }

  logger.warn("All Groq keys failed for field map, using heuristic")
  return fallbackMap
}

async function retryUnclearRowsWithGroq(
  batch: CleanBatchRequest,
  result: CleanBatchResult,
  fieldMap: FieldMap,
  apiKeys: string[]
) {
  if (apiKeys.length === 0 || AI_RETRY_ROWS_LIMIT === 0) {
    return result
  }

  const rawRowsByIdentity = new Map(batch.rows.map((row) => [sourceIdentity(row), row]))
  const retryCandidates = [...result.skipped_rows, ...result.missing_rows]
    .slice(0, AI_RETRY_ROWS_LIMIT)
    .map((row) => rawRowsByIdentity.get(sourceIdentity(row)))
    .filter((row): row is CleanBatchRequest["rows"][number] => Boolean(row))

  if (retryCandidates.length === 0) {
    return result
  }

  logger.info({ retryCount: retryCandidates.length }, "Retrying unclear rows with Groq")
  const replacements: CleanBatchRow[] = []

  const chunks = chunkArray(retryCandidates, AI_RETRY_CHUNK_SIZE)
  const queue = [...chunks.map((chunk, index) => ({ chunk, chunkIndex: index }))]

  async function worker(apiKey: string, keyIndex: number) {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) break
      
      const { chunk, chunkIndex } = item
      const chunkBatch = { ...batch, rows: chunk }

      try {
        logger.debug({ chunkIndex, keyIndex, chunkSize: chunk.length }, "Retry chunk with Groq")
        const response = await requestGroqJson({
          apiKey,
          keyIndex,
          systemPrompt: retrySystemPrompt,
          payload: {
            batch_id: batch.batch_id,
            selected_template: batch.selected_template,
            field_map: fieldMap,
            rows: chunk,
          },
          maxTokens: 1536,
        })
        const parsed = cleanBatchResultSchema.parse(response)
        const validRows = collectValidRetryRows(rebuildSummary(parsed, chunkBatch), chunkBatch)

        replacements.push(...validRows)
      } catch (error: any) {
        queue.unshift(item)
        if (error instanceof CleanBatchError && (error.status === 429 || error.groqStatus === 429)) {
          logger.warn({ keyIndex }, "Rate limit hit, waiting 60s for this worker")
          await new Promise(resolve => setTimeout(resolve, 60000))
        } else {
          logger.warn({ keyIndex, error: error.message }, "API error, waiting 5s before retrying chunk")
          await new Promise(resolve => setTimeout(resolve, 5000))
        }
      }
    }
  }

  await Promise.all(apiKeys.map((key, index) => worker(key, index)))

  if (replacements.length === 0) {
    logger.warn("No rows were replaced by Groq retry")
    return result
  }

  logger.info({ replacements: replacements.length }, "Rows replaced by Groq retry")
  return mergeRetryRows(batch, result, replacements)
}

function cleanRowsWithFieldMap(batch: CleanBatchRequest, fieldMap: FieldMap): CleanBatchResult {
  const result = emptyCleanBatchResult(batch.batch_id)

  for (const rawRow of batch.rows) {
    const row = cleanSingleRow(rawRow, batch.selected_template.columns, fieldMap)

    if (row.status === "good") {
      result.good_rows.push(row)
    } else if (row.status === "missing") {
      result.missing_rows.push(row)
    } else {
      result.skipped_rows.push(row)
    }
  }

  return rebuildSummary(result, batch)
}

function collectValidRetryRows(result: CleanBatchResult, batch: CleanBatchRequest) {
  const expectedRows = new Set(batch.rows.map(sourceIdentity))
  const columns = batch.selected_template.columns
  const rows = [...result.good_rows, ...result.missing_rows, ...result.skipped_rows]

  return rows.filter((row) => {
    const identity = sourceIdentity(row)

    return (
      expectedRows.has(identity) &&
      hasExactCleanedDataKeys(row, columns) &&
      hasValidMissingFields(row, columns) &&
      hasValidSkippedRow(row, columns) &&
      hasValidAiChanges(row)
    )
  })
}

function hasValidAiChanges(row: CleanBatchRow) {
  return row.ai_changes.every(
    (change) => change.before !== change.after && change.reason.trim().length > 0
  )
}

function hasValidSkippedRow(row: CleanBatchRow, columns: CleanBatchTemplateColumn[]) {
  if (row.status !== "skipped") {
    return true
  }

  const identityKeys = columns.filter(isIdentityOrContactColumn).map((c) => c.key)
  return identityKeys.every((key) => !String(row.cleaned_data[key] || "").trim())
}

function mergeRetryRows(batch: CleanBatchRequest, result: CleanBatchResult, replacements: CleanBatchRow[]) {
  const replacementByIdentity = new Map(replacements.map((row) => [sourceIdentity(row), row]))
  const rows = [...result.good_rows, ...result.missing_rows, ...result.skipped_rows].map((row) =>
    replacementByIdentity.get(sourceIdentity(row)) ?? row
  )
  const merged = emptyCleanBatchResult(batch.batch_id)

  for (const row of rows) {
    if (row.status === "good") {
      merged.good_rows.push(row)
    } else if (row.status === "missing") {
      merged.missing_rows.push(row)
    } else {
      merged.skipped_rows.push(row)
    }
  }

  return rebuildSummary(merged, batch)
}

function hasExactCleanedDataKeys(row: CleanBatchRow, columns: CleanBatchTemplateColumn[]) {
  const expectedKeys = columns.map((column) => column.key)
  const actualKeys = Object.keys(row.cleaned_data)

  return actualKeys.length === expectedKeys.length && expectedKeys.every((key) => actualKeys.includes(key))
}

function hasValidMissingFields(row: CleanBatchRow, columns: CleanBatchTemplateColumn[]) {
  const missingRequiredFields = columns
    .filter((column) => column.required && !String(row.cleaned_data[column.key] ?? "").trim())
    .map((column) => column.key)

  if (row.status === "good") {
    return missingRequiredFields.length === 0
  }

  if (row.status === "missing") {
    return sameStringSet(row.missing_fields, missingRequiredFields)
  }

  return row.missing_fields.length === 0
}

function cleanSingleRow(
  rawRow: CleanBatchRequest["rows"][number],
  columns: CleanBatchTemplateColumn[],
  fieldMap: FieldMap
): CleanBatchRow {
  const cleanedData = Object.fromEntries(columns.map((column) => [column.key, ""])) as Record<string, string>
  const mappedBefore = new Map<string, string>()
  const aiChanges: CleanBatchRow["ai_changes"] = []

  for (const [rawHeader, rawValue] of Object.entries(rawRow.data)) {
    const targets = normalizeTargets(fieldMap[rawHeader])

    for (const target of targets) {
      const column = columns.find((item) => item.key === target)

      if (!column || cleanedData[target]) {
        continue
      }

      const cleaned = cleanMappedValue({
        target,
        column,
        rawValue,
        rawHeader,
      })

      if (!cleaned) {
        continue
      }

      cleanedData[target] = cleaned
      mappedBefore.set(target, rawValue)
    }
  }

  let extraNotes: string[] = []

  for (const column of columns) {
    const before = mappedBefore.get(column.key) ?? ""
    const after = cleanedData[column.key] ?? ""

    if (before && before !== after) {
      aiChanges.push({
        field: column.key,
        before,
        after,
        reason: buildChangeReason(column.key),
      })
    }
    
    // Check if original value was a valid email/phone that didn't get mapped because another was chosen
    if (before && before !== after && after !== "") {
       if (isEmailColumn(column.key, column)) {
         const extra = extractEmail(before)
         if (extra && extra !== after) extraNotes.push(`Secondary Email: ${extra}`)
       }
       if (isMobileColumn(column.key, column)) {
         const extra = extractIndianMobile(before)
         if (extra && extra !== after) extraNotes.push(`Secondary Mobile: ${extra}`)
       }
    }
  }
  
  if (extraNotes.length > 0) {
    const notesColumn = columns.find(c => isNotesColumn(c.key, c))
    if (notesColumn) {
      cleanedData[notesColumn.key] = cleanedData[notesColumn.key]
        ? `${cleanedData[notesColumn.key]} | ${extraNotes.join(", ")}`
        : extraNotes.join(", ")
    }
  }

  const missingFields = columns
    .filter((column) => column.required && !cleanedData[column.key])
    .map((column) => column.key)
  const identityValues = columns
    .filter(isIdentityOrContactColumn)
    .map((column) => cleanedData[column.key])
    .filter(Boolean)
  const hasAnyCleanedValue = Object.values(cleanedData).some(Boolean)

  if (!hasAnyCleanedValue || identityValues.length === 0) {
    return {
      ...sourceFields(rawRow),
      status: "skipped",
      missing_fields: [],
      skip_reason: "no valid name, email, or mobile",
      cleaned_data: cleanedData,
      ai_changes: aiChanges,
    }
  }

  return {
    ...sourceFields(rawRow),
    status: missingFields.length > 0 ? "missing" : "good",
    missing_fields: missingFields,
    skip_reason: "",
    cleaned_data: cleanedData,
    ai_changes: aiChanges,
  }
}

function cleanMappedValue(input: {
  target: string
  column: CleanBatchTemplateColumn
  rawHeader: string
  rawValue: string
}) {
  const value = normalizePlaceholder(input.rawValue)

  if (!value) {
    return ""
  }

  if (isEmailColumn(input.target, input.column)) {
    return extractEmail(value)
  }

  if (isMobileColumn(input.target, input.column)) {
    return extractIndianMobile(value)
  }

  if (isCountryCodeColumn(input.target, input.column)) {
    return extractCountryCode(value)
  }

  if (isDateColumn(input.target, input.column)) {
    return formatDateTime(value)
  }

  if (isLocationColumn(input.target, input.column)) {
    return extractLocationPart(input.target, value)
  }

  if (isNotesColumn(input.target, input.column)) {
    return collapseSpaces(value)
  }

  if (shouldTitleCase(input.target, input.column, value)) {
    return titleCase(collapseSpaces(value))
  }

  return collapseSpaces(value)
}

function buildHeuristicFieldMap(batch: CleanBatchRequest): FieldMap {
  const headers = getAllHeaders(batch)
  const fieldMap: FieldMap = {}

  for (const header of headers) {
    const targets = inferTargetsForHeader(header, batch.selected_template.columns)

    if (targets.length > 0) {
      fieldMap[header] = targets.length === 1 ? targets[0] : targets
    }
  }

  return fieldMap
}

function inferTargetsForHeader(header: string, columns: CleanBatchTemplateColumn[]) {
  const normalizedHeader = normalizeKey(header)
  const directTargets = columns
    .filter((column) => {
      const key = normalizeKey(column.key)
      const label = normalizeKey(column.label)

      return normalizedHeader === key || normalizedHeader === label
    })
    .map((column) => column.key)

  if (directTargets.length > 0) {
    return directTargets
  }

  const semanticTargets = columns.filter((column) => headerMatchesColumn(normalizedHeader, column)).map((column) => column.key)

  if (semanticTargets.length > 0) {
    return semanticTargets
  }

  return columns
    .filter((column) => {
      const key = normalizeKey(column.key)
      const label = normalizeKey(column.label)

      return normalizedHeader.includes(key) || normalizedHeader.includes(label) || key.includes(normalizedHeader)
    })
    .map((column) => column.key)
}

function headerMatchesColumn(normalizedHeader: string, column: CleanBatchTemplateColumn) {
  const target = normalizeKey(`${column.key} ${column.label}`)

  return (
    matchesAny(normalizedHeader, ["contact_details", "contact", "phone", "mobile", "number"]) &&
      (target.includes("mobile") || target.includes("phone") || target.includes("country_code")) ||
    matchesAny(normalizedHeader, ["contact_details", "email", "mail"]) && target.includes("email") ||
    matchesAny(normalizedHeader, ["full_name", "customer", "customer_name", "name"]) && target.includes("name") ||
    matchesAny(normalizedHeader, ["created", "created_time", "lead_date", "date"]) &&
      (target.includes("date") || target.includes("created") || target.includes("time")) ||
    matchesAny(normalizedHeader, ["city_state", "location", "city", "area"]) && target.includes("city") ||
    matchesAny(normalizedHeader, ["city_state", "location", "state", "province"]) && target.includes("state") ||
    matchesAny(normalizedHeader, ["location", "country"]) && target.includes("country") ||
    matchesAny(normalizedHeader, ["project_property", "project", "property"]) &&
      (target.includes("project") || target.includes("property")) ||
    matchesAny(normalizedHeader, ["owner", "owner_name", "lead_owner"]) && target.includes("owner") ||
    matchesAny(normalizedHeader, ["campaign", "lead_source", "source", "data_source"]) &&
      (target.includes("source") || target.includes("campaign")) ||
    matchesAny(normalizedHeader, ["remarks_notes", "remarks", "notes", "crm_note", "description", "message", "comment"]) &&
      (target.includes("note") || target.includes("description") || target.includes("message") || target.includes("comment")) ||
    matchesAny(normalizedHeader, ["company", "organization", "business"]) &&
      (target.includes("company") || target.includes("organization") || target.includes("business")) ||
    matchesAny(normalizedHeader, ["crm_status", "status"]) && target.includes("status")
  )
}

function matchesAny(value: string, candidates: string[]) {
  return candidates.some((candidate) => value.includes(candidate))
}

function buildMappingPayload(batch: CleanBatchRequest) {
  return {
    batch_id: batch.batch_id,
    selected_template: batch.selected_template,
    sheets: buildSheetSamples(batch),
  }
}

function buildSheetSamples(batch: CleanBatchRequest) {
  const samplesBySheet = new Map<
    string,
    {
      source_sheet: string
      source_sheet_index: number
      headers: string[]
      sample_rows: Array<Record<string, string>>
    }
  >()
  let sampleCount = 0

  for (const row of batch.rows) {
    const key = `${row.source_sheet_index}:${row.source_sheet}`
    const existing = samplesBySheet.get(key)

    if (!existing) {
      samplesBySheet.set(key, {
        source_sheet: row.source_sheet,
        source_sheet_index: row.source_sheet_index,
        headers: Object.keys(row.data),
        sample_rows: sampleCount < MAX_MAPPING_SAMPLE_ROWS ? [row.data] : [],
      })
      sampleCount += sampleCount < MAX_MAPPING_SAMPLE_ROWS ? 1 : 0
      continue
    }

    existing.headers = [...new Set([...existing.headers, ...Object.keys(row.data)])]

    if (sampleCount < MAX_MAPPING_SAMPLE_ROWS && existing.sample_rows.length < 3) {
      existing.sample_rows.push(row.data)
      sampleCount += 1
    }
  }

  return [...samplesBySheet.values()]
}

function getAllHeaders(batch: CleanBatchRequest) {
  return [...new Set(batch.rows.flatMap((row) => Object.keys(row.data)))]
}

function sanitizeFieldMap(fieldMap: FieldMap, batch: CleanBatchRequest): FieldMap {
  const allowedHeaders = new Set(getAllHeaders(batch))
  const allowedTargets = new Set(batch.selected_template.columns.map((column) => column.key))
  const sanitized: FieldMap = {}

  for (const [header, target] of Object.entries(fieldMap)) {
    if (!allowedHeaders.has(header)) {
      continue
    }

    const targets = normalizeTargets(target).filter((item) => allowedTargets.has(item))

    if (targets.length > 0) {
      sanitized[header] = targets.length === 1 ? targets[0] : targets
    }
  }

  return sanitized
}

function normalizeTargets(value: string | string[] | undefined) {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

async function requestGroqJson(input: {
  apiKey: string
  keyIndex: number
  systemPrompt: string
  payload: unknown
  maxTokens: number
}) {
  const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL_NAME ?? "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: JSON.stringify(input.payload) },
      ],
      max_tokens: input.maxTokens,
      temperature: 0,
      top_p: 1,
      reasoning_effort: "low",
      reasoning_format: "hidden",
      response_format: { type: "json_object" },
      stream: false,
    }),
  })
  const responseText = await response.text()

  if (!response.ok) {
    throw new CleanBatchError(
      response.status === 429 ? "GROQ_RATE_LIMIT" : "GROQ_REQUEST_FAILED",
      `Groq request failed on key ${input.keyIndex + 1} with HTTP ${response.status}.`,
      response.status === 429 ? 429 : 502,
      response.status,
      responseText.slice(0, 500)
    )
  }

  const payload = parseJson<GroqChatResponse>(responseText)
  const content = payload.choices?.[0]?.message?.content

  if (!content) {
    throw new CleanBatchError("GROQ_EMPTY_RESPONSE", "Groq returned an empty response.", 502)
  }

  return parseJsonObjectFromContent(content)
}

function normalizePlaceholder(value: string) {
  const compact = collapseSpaces(value)

  if (!compact) {
    return ""
  }

  if (/^[-_*]+$/.test(compact) || /^(n\/a|na|null|undefined|none|nil)$/i.test(compact)) {
    return ""
  }

  return compact
}

function collapseSpaces(value: string) {
  return String(value ?? "").replace(/\s+/g, " ").trim()
}

function extractEmail(value: string) {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)

  return match?.[0].toLowerCase() ?? ""
}

function extractIndianMobile(value: string) {
  const candidates = value.match(/\+?\d[\d\s().-]{8,}\d/g) ?? []

  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, "")

    if (digits.length >= 10 && digits.length <= 14) {
      const mobile = digits.slice(-10)
      if (/^[6-9]/.test(mobile)) {
        return mobile
      }
    }
  }

  return ""
}

function extractCountryCode(value: string) {
  const digits = value.replace(/\D/g, "")

  if (/\+91/.test(value) || (digits.length === 12 && digits.startsWith("91"))) {
    return "+91"
  }

  return ""
}

function formatDateTime(value: string) {
  const normalized = value.trim().replace("T", " ")
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2})(?::(\d{2}))?)?$/)
  const reverseMatch = normalized.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{1,2})(?::(\d{2}))?)?$/)

  if (match) {
    const [, year, month, day, hour, minute] = match

    return buildDateTime({ year, month, day, hour, minute })
  }

  if (reverseMatch) {
    const [, day, month, year, hour, minute] = reverseMatch

    return buildDateTime({ year, month, day, hour, minute })
  }

  return ""
}

function buildDateTime(input: {
  year: string
  month: string
  day: string
  hour?: string
  minute?: string
}) {
  const year = Number(input.year)
  const month = Number(input.month)
  const day = Number(input.day)
  const date = new Date(Date.UTC(year, month - 1, day))

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return ""
  }

  const formattedDate = `${input.day.padStart(2, "0")}-${input.month.padStart(2, "0")}-${input.year}`

  if (!input.hour) {
    return formattedDate
  }

  const hour = Number(input.hour)
  const minute = Number(input.minute ?? "0")

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return ""
  }

  return `${formattedDate} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

function extractLocationPart(target: string, value: string) {
  const parts = value
    .split(/[,|>-]+/)
    .map((part) => collapseSpaces(part))
    .filter(Boolean)

  if (target.includes("city")) {
    return parts[0] ? titleCase(parts[0]) : titleCase(value)
  }

  if (target.includes("state")) {
    return parts.length >= 2 ? titleCase(parts[1]) : ""
  }

  if (target.includes("country")) {
    return parts.length >= 3 ? titleCase(parts[2]) : ""
  }

  return titleCase(value)
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase())
}

function isEmailColumn(key: string, column: CleanBatchTemplateColumn) {
  return normalizeKey(`${key} ${column.label}`).includes("email")
}

function isMobileColumn(key: string, column: CleanBatchTemplateColumn) {
  const normalized = normalizeKey(`${key} ${column.label}`)

  return normalized.includes("mobile") || normalized.includes("phone")
}

function isCountryCodeColumn(key: string, column: CleanBatchTemplateColumn) {
  return normalizeKey(`${key} ${column.label}`).includes("country_code")
}

function isDateColumn(key: string, column: CleanBatchTemplateColumn) {
  const normalized = normalizeKey(`${key} ${column.label} ${column.type}`)

  return normalized.includes("date") || normalized.includes("time") || normalized.includes("created")
}

function isLocationColumn(key: string, column: CleanBatchTemplateColumn) {
  const normalized = normalizeKey(`${key} ${column.label}`)

  return normalized.includes("city") || normalized.includes("state") || normalized.includes("country")
}

function isNotesColumn(key: string, column: CleanBatchTemplateColumn) {
  const normalized = normalizeKey(`${key} ${column.label}`)

  return (
    normalized.includes("note") ||
    normalized.includes("remark") ||
    normalized.includes("description") ||
    normalized.includes("message") ||
    normalized.includes("comment")
  )
}

function shouldTitleCase(key: string, column: CleanBatchTemplateColumn, value: string) {
  const normalized = normalizeKey(`${key} ${column.label}`)

  if (/^[A-Z0-9_ -]{3,}$/.test(value) && normalized.includes("status")) {
    return false
  }

  return [
    "name",
    "city",
    "state",
    "country",
    "source",
    "company",
    "project",
    "property",
    "owner",
    "status",
    "category",
  ].some((item) => normalized.includes(item))
}

function isIdentityOrContactColumn(column: CleanBatchTemplateColumn) {
  const normalized = normalizeKey(`${column.key} ${column.label}`)

  return normalized.includes("name") || normalized.includes("email") || normalized.includes("mobile") || normalized.includes("phone")
}

function buildChangeReason(key: string) {
  if (key.includes("email")) {
    return "Extracted and normalized email from mapped source."
  }

  if (key.includes("mobile") || key.includes("phone")) {
    return "Extracted valid mobile number from mapped source."
  }

  if (key.includes("date") || key.includes("created")) {
    return "Validated and formatted date from mapped source."
  }

  if (key.includes("country_code")) {
    return "Extracted country code from mapped source."
  }

  return "Cleaned mapped source value with backend rules."
}

function sourceFields(row: CleanBatchRequest["rows"][number]) {
  return {
    source_sheet: row.source_sheet,
    source_sheet_index: row.source_sheet_index,
    source_row_index: row.source_row_index,
  }
}

function sourceIdentity(row: Pick<CleanBatchRow, "source_sheet" | "source_sheet_index" | "source_row_index">) {
  return `${row.source_sheet_index}:${row.source_sheet}:${row.source_row_index}`
}

function sameStringSet(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false
  }

  const rightValues = new Set(right)
  return left.every((value) => rightValues.has(value))
}

function rebuildSummary(result: CleanBatchResult, rawBatch: CleanBatchRequest): CleanBatchResult {
  const allRows = [...result.good_rows, ...result.missing_rows, ...result.skipped_rows]
  const missingByField = countBy(result.missing_rows.flatMap((row) => row.missing_fields))
  const skippedByReason = countBy(result.skipped_rows.map((row) => row.skip_reason || "skipped"))

  return {
    ...result,
    summary: {
      total_input_rows: rawBatch.rows.length,
      good_count: result.good_rows.length,
      missing_count: result.missing_rows.length,
      skipped_count: result.skipped_rows.length,
      ai_changed_row_count: allRows.filter((row) => row.ai_changes.length > 0).length,
      ai_changed_cell_count: allRows.reduce((total, row) => total + row.ai_changes.length, 0),
      missing_by_field: missingByField,
      skipped_by_reason: skippedByReason,
    },
  }
}

function countBy(items: string[]) {
  return items.reduce<Record<string, number>>((counts, item) => {
    counts[item] = (counts[item] ?? 0) + 1
    return counts
  }, {})
}

function emptyCleanBatchResult(batchId: string): CleanBatchResult {
  return {
    batch_id: batchId,
    good_rows: [],
    missing_rows: [],
    skipped_rows: [],
    summary: {
      total_input_rows: 0,
      good_count: 0,
      missing_count: 0,
      skipped_count: 0,
      ai_changed_row_count: 0,
      ai_changed_cell_count: 0,
      missing_by_field: {},
      skipped_by_reason: {},
    },
  }
}

function parseJson<T>(value: string) {
  try {
    return JSON.parse(value) as T
  } catch {
    throw new CleanBatchError("GROQ_RESPONSE_INVALID", "Groq returned invalid JSON.", 502)
  }
}

function parseJsonObjectFromContent(content: string) {
  const trimmed = content.trim()

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    const startIndex = trimmed.indexOf("{")
    const endIndex = trimmed.lastIndexOf("}")

    if (startIndex >= 0 && endIndex > startIndex) {
      return parseJson(trimmed.slice(startIndex, endIndex + 1))
    }

    throw new CleanBatchError("GROQ_RESPONSE_INVALID", "Groq returned a non-JSON response.", 502)
  }
}

function getGroqApiKeys() {
  return [
    process.env.GROQ_API_KEY,
  ].filter((key, index, keys): key is string => Boolean(key) && keys.indexOf(key) === index)
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.floor(value)))
}

const fieldMapResponseSchema = z.object({
  field_map: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
})

class CleanBatchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly groqStatus?: number,
    public readonly details?: string
  ) {
    super(message)
    this.name = "CleanBatchError"
  }
}

export default router
