# Groq Clean Batch Model Notes

## Rate Limits

Per Groq API key:

| Limit | Value |
| --- | --- |
| Requests | 30 / min, 1K / day |
| Tokens | 8K / min, 200K / day |

With 3 keys in the fallback chain, the effective ceiling is approximately 24K tokens/min and 600K tokens/day, assuming load is spread across all keys and each key has fresh quota.

Important: the 3-key chain does not make one oversized request valid. Each single Groq request still must fit inside the per-key TPM/request ceiling. If one request asks for more than 8K tokens, Groq rejects it before fallback can help.

## Hybrid Cleaning Rule

Do not send all spreadsheet rows to AI.

For large files such as 10,000 rows, use this low-cost production flow:

| Step | Owner | Cost |
| --- | --- | --- |
| Read Excel/CSV | Frontend/backend code | Free |
| Convert rows to raw JSON | Code | Free |
| Detect headers and mapping | AI once using headers + 5-10 sample rows | Very low |
| Clean all rows | Backend rules/code | Free |
| Validate good/missing/skipped | Backend rules/code | Free |
| Retry only failed/unclear rows | AI, capped | Small |
| Export final Excel | Backend code | Free |

AI mapping input should include only:

- `selected_template`
- sheet names and headers
- 5 to 10 sample rows

AI mapping output:

```json
{
  "field_map": {
    "Created Time ": "created_at",
    "FULL NAME": "name",
    "Contact Details": ["email", "country_code", "mobile_without_country_code"],
    "Project / Property": "project_interested",
    "Owner Name": "lead_owner",
    "CRM STATUS": "crm_status",
    "Remarks / Notes": "crm_note",
    "Location": ["city", "state", "country"],
    "Lead Source": "data_source",
    "Description": "description"
  }
}
```

Then backend code applies the map to every raw row.

Backend should clean locally:

- email extraction
- mobile extraction
- country code extraction
- date format validation
- placeholder removal
- title casing
- required field checks
- good/missing/skipped split
- summary calculation
- Excel export

AI is only for:

- messy header mapping
- unclear columns
- very confusing notes
- unknown field meanings
- capped retry of failed/unclear rows

Current backend behavior:

- Groq sees only headers + sheet samples for mapping.
- Backend rules clean every row.
- If Groq is unavailable, local heuristic header mapping is used.
- AI retry is capped by `GROQ_RETRY_FAILED_ROWS_LIMIT`, default `100`, maximum `500`.
- Final `summary` is always rebuilt from code.

Best output Excel sheets:

1. All Rows
2. Good Rows
3. Missing Rows
4. Skipped Rows
5. AI Changes
6. Summary

## Summary Rule

Never trust the AI-generated `summary` object directly.

After receiving and parsing the AI JSON, rebuild the summary from the returned arrays and the original raw batch before validating or displaying the result.

```ts
function rebuildSummary(result: any, rawBatch: any) {
  const goodRows = result.good_rows || []
  const missingRows = result.missing_rows || []
  const skippedRows = result.skipped_rows || []
  const allRows = [...goodRows, ...missingRows, ...skippedRows]

  const missingByField: Record<string, number> = {}
  for (const row of missingRows) {
    for (const field of row.missing_fields || []) {
      missingByField[field] = (missingByField[field] || 0) + 1
    }
  }

  const skippedByReason: Record<string, number> = {}
  for (const row of skippedRows) {
    const reason = row.skip_reason || "unknown"
    skippedByReason[reason] = (skippedByReason[reason] || 0) + 1
  }

  const aiChangedRowCount = allRows.filter(
    (row: any) => Array.isArray(row.ai_changes) && row.ai_changes.length > 0
  ).length

  const aiChangedCellCount = allRows.reduce(
    (sum: number, row: any) => sum + (row.ai_changes || []).length,
    0
  )

  result.summary = {
    total_input_rows: rawBatch.rows.length,
    good_count: goodRows.length,
    missing_count: missingRows.length,
    skipped_count: skippedRows.length,
    ai_changed_row_count: aiChangedRowCount,
    ai_changed_cell_count: aiChangedCellCount,
    missing_by_field: missingByField,
    skipped_by_reason: skippedByReason,
  }

  return result
}
```

Call order:

```ts
const parsed = JSON.parse(content)
rebuildSummary(parsed, rawBatch)
const err = validateCleanResult(parsed, rawBatch)
```

Key rule: `summary.total_input_rows` must equal `rawBatch.rows.length`. Never count by `source_row_index`, highest Excel row number, CSV row number, or max row number.

## Prompt Requirements

Hard rules must include:

```txt
total_input_rows must equal input.rows.length only. Do not use source_row_index, Excel row number, CSV row number, or highest row number.
```

Final self-check must include:

```txt
total_input_rows = input.rows.length only.
Never use source_row_index max as total_input_rows.
ai_changed_row_count equals count of rows where ai_changes.length > 0.
```

Date output rule:

```txt
Output DD-MM-YYYY or DD-MM-YYYY HH:mm. If input has time, output HH:mm.
```
