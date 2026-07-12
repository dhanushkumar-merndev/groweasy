# GrowEasy AI Model And Cleaning Pipeline

This file documents the current AI behavior in the backend. The main implementation is [backend/src/server/ai/excel-cleaner.ts](/mnt/Secondary/video/assignment/backend/src/server/ai/excel-cleaner.ts), with deterministic cleanup in [backend/src/lib/formatting.ts](/mnt/Secondary/video/assignment/backend/src/lib/formatting.ts).

## Core Design

GrowEasy does not send every decision blindly to an AI model. It uses a hybrid pipeline:

```text
Raw spreadsheet rows
  -> deterministic mapping/extraction/formatting
  -> choose only rows that need AI
  -> provider call, if a key is available
  -> parse and normalize AI JSON
  -> final local validation and summary rebuild
  -> cache/store cleaned rows
```

The important rule is: counts, status, and summaries are rebuilt from actual row arrays after processing. AI output can improve row values, but the backend still validates and normalizes the result.

## Prompt Version

The active CRM row cleaner prompt version is:

```text
excel-cleaner-v12
```

It is exported as `EXCEL_CLEANER_PROMPT_VERSION` from [backend/src/server/ai/prompts/excel-cleaner.ts](/mnt/Secondary/video/assignment/backend/src/server/ai/prompts/excel-cleaner.ts).

## Row Data Model

### Raw Row

Each raw row has:

```ts
{
  id: string
  import_id: string
  sheet_id: string
  sheet_name: string
  sheet_index: number
  row_index: number
  raw_data: Record<string, string | number | boolean | null>
}
```

### Cleaned Row

After processing, each row becomes:

```ts
{
  ...rawRow,
  cleaned_data: Record<string, string | number | boolean | null>
  status: "good" | "missing" | "skipped"
  missing_fields: string[]
  skip_reason?: string
  ai_changes: Array<{
    field: string
    before: string | null
    after: string | null
    reason: string
  }>
}
```

### Status Meaning

| Status | Meaning |
| --- | --- |
| `good` | Required/contact rules are satisfied. |
| `missing` | Useful row exists but required/contact fields are still missing. |
| `skipped` | Row has no useful identity/contact/template-mapped value. |

## Deterministic Phase

The deterministic phase runs for every row through `cleanRowsWithTemplate()`.

### 1. Source Mapping

For each template column, the cleaner searches the raw row using:

- exact normalized header matches,
- source hints from the template,
- synonym-aware meaning keys,
- learned source hints from previous successful imports.

Example mappings:

- `Phone`, `Mobile`, `WhatsApp`, `Contact Details` -> mobile/contact columns
- `Created Time`, `Lead Date`, `Timestamp` -> `created_at`
- `Remarks`, `Notes`, `Follow Up`, `Description` -> note/description fields
- `Location`, `City/State`, location-like values -> city/state/country fields

### 2. Value Extraction

Before formatting, the cleaner extracts structured values from messy cells:

- email: first syntactically valid email, lowercased later by format rules,
- Indian mobile: collects digits from phone-like text and keeps the last valid 10 digits starting with 6/7/8/9,
- country code: extracts explicit `+<1-3 digits>` when present,
- location: can split clear city/state/country text,
- date: can normalize date-like values for `date_dd_mm_yyyy`.

### 3. Sanitization

`sanitizeCellValue()` blanks or neutralizes unsafe/noisy values:

- blank/null/undefined,
- dash-only values such as `-`, `--`, `___`,
- garbage marker values such as `#`, `###`,
- nullish placeholders such as `NA`, `N/A`, `null`, `none`, `test`, `sample`,
- formula-like values beginning with `=`, `+`, `@`, or dangerous `-...`, unless they are safe phone-number-like strings.

Formula-like unsafe strings are prefixed with `'` so spreadsheet exports do not execute formulas.

### 4. Formatting Rules

Template columns can apply these rules:

```text
uppercase
lowercase
title_case
align_left
align_right
align_center
last_10_digits
add_country_code_91
digits_only
today_date
time_hh_mm
time_hh_mm_ss
convert_to_ist
remove_dashes
remove_underscores
remove_dots
date_dd_mm_yyyy
dash_to_blank
blank_column
dict_lookup
dict_lookup_with_default
```

Alignment and dictionary rules are accepted as template rules but are no-ops in the backend formatting function unless another layer uses them later.

### 5. Optional Local Spelling Normalization

If `correct_spelling` is enabled, deterministic spelling normalization runs on text values before AI. AI can also be asked to fix obvious spelling when the intended value is clear.

### 6. Required Field Detection

The backend evaluates required fields and contact rules:

- If `require_both_email_phone=true`, both email and phone/mobile are required when those fields exist in the template.
- If `require_both_email_phone=false`, either a valid email or valid phone/mobile can satisfy contact reachability.
- A missing name alone should not make the row missing when valid contact data exists.

## When Rows Go To AI

`shouldSendToAi()` decides whether a row needs AI.

Rows are sent to AI when:

- status is `missing`,
- status is `skipped` because nothing meaningful mapped to the template,
- status is `good` and `AI_REVIEW_GOOD_ROWS` is not set to `false`, provided there is reviewable text,
- `correct_spelling=true` and there is reviewable text,
- `generate_description=true`, the template has a description column, the row is not skipped, and description is empty.

Rows are not sent to AI when deterministic cleanup is enough and review/generation is not needed.

## AI Request Shape

The cleaner sends JSON context, not raw prompt prose only. The payload includes:

- `batch_no`,
- template column keys, labels, required flags, and format rules,
- source headers with sample values,
- rules for contact requirements, spelling, and description generation,
- review mode,
- row IDs, sheet names, row indexes, and raw data,
- an output shape marker: `AiBatchResult.rows only`.

For strict providers, the user payload begins with an explicit JSON-only wrapper:

```text
Return only this JSON shape: {"rows":[...]}.
```

## AI Output Contract

The model must return exactly one JSON object:

```json
{
  "rows": [
    {
      "id": "same input id",
      "cleaned_data": {},
      "status": "good",
      "missing_fields": [],
      "ai_changes": []
    }
  ]
}
```

Rules enforced in the prompt:

- return JSON only,
- first non-whitespace character is `{`,
- last character is `}`,
- output one row for every input row ID,
- use only template keys inside `cleaned_data`,
- never invent name/email/phone/mobile/contact values,
- extract email, country code, and Indian mobile from mixed contact cells,
- split clear city/state/country locations,
- apply template formatting rules,
- preserve source spelling unless `correct_spelling=true`,
- generate description only when requested and only from row data,
- keep descriptions under 100 characters,
- respect the configured contact requirement.

## Provider Selection

The row cleaner supports three provider labels:

```text
cloudflare
commandcode
groq
```

Provider normalization:

| Input | Normalized provider |
| --- | --- |
| `cloudflare`, `workersai` | `cloudflare` |
| `commandcode` | `commandcode` |
| anything else | `groq` |

### Default Row Cleaner Provider

The row cleaner reads:

```text
AI_PROCESS_PROVIDER
ROW_AI_PROVIDER
```

If neither is set, it defaults to:

```text
cloudflare
```

The row cleaner model reads:

```text
AI_PROCESS_MODEL
ROW_AI_MODEL
CLOUDFLARE_AI_MODEL
```

If no compatible model is configured, it chooses the provider default.

### Provider Defaults

| Provider | Default model |
| --- | --- |
| Cloudflare Workers AI | `@cf/google/gemma-4-26b-a4b-it` |
| CommandCode | `deepseek/deepseek-v4-pro` |
| Groq | `meta-llama/llama-4-scout-17b-16e-instruct` |

`FALLBACK_AI_MODEL` defaults to `llama-3.2-70b-instruct` in the row cleaner code.

### Model Validation

`getPrimaryModelForProvider()` keeps the configured model compatible with the selected provider. If a configured model does not belong to the provider, the provider default is used.

## API Keys

User keys can be saved from Settings. They are encrypted at rest through [backend/src/lib/crypto.ts](/mnt/Secondary/video/assignment/backend/src/lib/crypto.ts), stored in `user_ai_settings.encrypted_api_key`, and decrypted only at runtime.

The active key order is:

1. user key, when `use_user_api_key=true`,
2. provider-specific environment keys,
3. deterministic fallback if no key succeeds.

Environment key names:

| Provider | Keys |
| --- | --- |
| Cloudflare | `CLOUDFLARE_API`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_API_KEY`, plus account ID from `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ACCOUNT`, or `CF_ACCOUNT_ID`. A Cloudflare key may also be stored as JSON or `accountId:token`. |
| CommandCode | `COMMAND_CODE_API_KEY`, `COMMANDCODE_API_KEY` |
| Groq | `GROQ_API_KEY` |

The code also uses `COMMAND_CODE_BASE_URL`, defaulting to:

```text
https://api.commandcode.ai/provider/v1
```

## User AI Settings

Settings are managed by [backend/src/routes/settings.ts](/mnt/Secondary/video/assignment/backend/src/routes/settings.ts).

Stored fields:

- provider,
- model,
- encrypted API key,
- whether the user key is active,
- detailed review mode,
- batch size,
- request batch size.

Important behavior:

- Without an active user key, `getUserAiSettings()` returns `batchSize=5` and `requestBatchSize=5`.
- With an active user key, defaults depend on the provider/model and user settings.
- Batch limits are `batchSize` 5-100 and `requestBatchSize` 1-30.
- `requestBatchSize` is clamped so it never exceeds `batchSize`.

## Batch Processing

Two batch levels exist:

| Level | Meaning |
| --- | --- |
| `batchSize` | UI/import progress batch size. One batch creates one `AiBatchResult`. |
| `requestBatchSize` | Maximum rows per individual provider request inside a batch. |

The row cleaner:

1. chunks all raw rows by `batchSize`,
2. runs deterministic cleaning for the whole batch,
3. filters `rowsNeedingAi`,
4. optionally chunks AI rows again by `requestBatchSize`,
5. calls the active provider,
6. merges AI rows over deterministic rows by row ID,
7. finalizes rows locally,
8. caches each batch result at `import:{importId}:batch:{batchNo}:v1`.

Token usage is accumulated across successful AI provider responses.

## Retry And Fallback Behavior

### Cloudflare

- Uses Workers AI HTTP calls.
- Requires account ID plus token.
- Tries combinations of credentials and candidate models.
- Timeout defaults to 60 seconds through `CLOUDFLARE_AI_TIMEOUT_MS`.
- Falls back to deterministic rows if all attempts fail.

### CommandCode

- Uses OpenAI-compatible chat completions.
- Base URL defaults to `https://api.commandcode.ai/provider/v1`.
- Attempts are limited by `COMMAND_CODE_AI_MAX_ATTEMPTS`, default 1, allowed 1-6.
- Timeout defaults to 25 seconds through `COMMAND_CODE_AI_TIMEOUT_MS`.
- Can include `COMMAND_CODE_FALLBACK_AI_MODEL`.
- Falls back to deterministic rows if all attempts fail.

### Groq

- Uses the `groq-sdk`.
- Attempts are at least `AI_MAX_RETRIES + 1`, and also account for key/model combinations.
- `AI_MAX_RETRIES` defaults to 2.
- `AI_MAX_COMPLETION_TOKENS` defaults to 2048 and is clamped from 512 to 8192.
- If finish reason is `length`, the response is rejected and retried.
- Falls back to deterministic rows if all attempts fail.

### Universal Fallback

If an AI call fails, returns empty content, returns malformed JSON, returns an invalid row set, or exhausts keys/models, the backend uses deterministic local cleaned rows. Processing continues and logs warnings instead of failing the whole import.

## Parsing And Normalization Of AI JSON

`parseGroqRows()` is used for provider responses despite the name. It:

- parses the JSON response,
- extracts `rows`,
- matches rows by ID against deterministic fallback rows,
- requires valid template keys,
- normalizes status and missing fields,
- protects contact fields from being accidentally emptied,
- drops invalid/no-op `ai_changes`,
- recomputes missing fields/status using deterministic logic.

After parsing, `finalizeCleanedRow()` applies final local behavior:

- description generation fallback when requested,
- local spelling normalization where configured,
- required/contact rules,
- cleaned status,
- AI change list cleanup.

## SSE Events

The streaming endpoint is:

```text
GET /api/imports/:id/stream
```

The frontend opens it with:

```text
/api/imports/:id/stream?force=1
```

Events are sent as plain SSE `data: <json>` messages.

### `connected`

```json
{ "type": "connected" }
```

### `batch_started`

```json
{
  "type": "batch_started",
  "batch_no": 1,
  "total_batches": 4,
  "batch_rows": 5,
  "ai_rows": 3,
  "model": "cloudflare/@cf/google/gemma-4-26b-a4b-it"
}
```

### `batch_completed`

```json
{
  "type": "batch_completed",
  "batch_no": 1,
  "total_batches": 4,
  "good_count": 4,
  "missing_count": 1,
  "skipped_count": 0,
  "ai_changed_count": 2,
  "batch_good_count": 4,
  "batch_missing_count": 1,
  "batch_skipped_count": 0,
  "batch_ai_changed_count": 2,
  "batch_output_rows": 5,
  "ai_rows": 3,
  "ai_used": true,
  "batch_token_usage": {
    "prompt_tokens": 1000,
    "completion_tokens": 200,
    "total_tokens": 1200
  }
}
```

### `progress`

```json
{
  "type": "progress",
  "processed_rows": 5,
  "total_rows": 20,
  "percent": 25
}
```

### `token_usage`

```json
{
  "type": "token_usage",
  "token_usage": {
    "prompt_tokens": 4000,
    "completion_tokens": 800,
    "total_tokens": 4800
  }
}
```

### `completed`

```json
{
  "type": "completed",
  "import_id": "uuid",
  "token_usage": {
    "prompt_tokens": 4000,
    "completion_tokens": 800,
    "total_tokens": 4800
  }
}
```

### `error`

```json
{
  "type": "error",
  "message": "Processing failed."
}
```

## Import Summary

After all batches finish, `summarizeCleanedRows()` rebuilds counts from final rows and sheets:

- total rows,
- good rows,
- missing rows,
- skipped rows,
- fixed missing rows,
- AI changed count,
- missing-by-field counts,
- sheet summary.

The import is updated to:

```text
status = processed
model_used = active provider/model or demo-local-cleaner
```

Processed rows are cached at:

```text
import:{importId}:formatted:v1
import:{importId}:missing:v1
import:{importId}:skipped:v1
```

## Clean Batch API

The separate route [backend/src/routes/clean-batch.ts](/mnt/Secondary/video/assignment/backend/src/routes/clean-batch.ts) implements:

```text
POST /api/clean-batch
```

It is an external/programmatic API with a different flow:

```text
request rows + selected template
  -> infer field map
  -> deterministic clean with that field map
  -> retry missing/skipped rows with Groq when available
  -> rebuild clean-batch summary
```

Key differences from the main import pipeline:

- It is built around `selected_template.columns`, not stored app templates.
- It uses Groq for field-map inference and retry when Groq keys exist.
- It returns `good_rows`, `missing_rows`, `skipped_rows`, and a summary.
- It validates that retry rows preserve source identity and template keys.

## Analytics AI

Analytics AI is separate from row cleaning. It lives in [backend/src/routes/analytics.ts](/mnt/Secondary/video/assignment/backend/src/routes/analytics.ts).

The endpoint is:

```text
POST /api/analytics/suggest-chart
```

Behavior:

1. Build a deterministic fallback chart suggestion.
2. If an AI key is available, ask the provider for 4-8 useful CRM chart blocks.
3. Normalize returned charts to existing columns and supported chart types.
4. Fall back to deterministic charts on failure.

Analytics provider env variables:

```text
ANALYTICS_AI_PROVIDER
ANALYTICS_AI_MODEL
ANALYTICS_AI_TIMEOUT_MS
ANALYTICS_AI_MAX_TOKENS
ANALYTICS_AI_MAX_ATTEMPTS
PRIMARY_AI_PROVIDER
PRIMARY_AI_MODEL
```

Analytics defaults:

| Provider | Default model |
| --- | --- |
| Cloudflare | `@cf/google/gemma-4-26b-a4b-it` |
| CommandCode | `deepseek/deepseek-v4-pro` |
| Groq | `qwen/qwen3.6-27b` |

## Operational Limits

| Setting | Default | Bounds/notes |
| --- | --- | --- |
| `AI_MAX_RETRIES` | 2 | 0-10 |
| `AI_MAX_COMPLETION_TOKENS` | 2048 | 512-8192 |
| `COMMAND_CODE_AI_MAX_ATTEMPTS` | 1 | 1-6 |
| `COMMAND_CODE_AI_TIMEOUT_MS` | 25000 | 5000-120000 |
| `CLOUDFLARE_AI_TIMEOUT_MS` | 60000 | 10000-120000 |
| `AI_MAX_CONCURRENT_IMPORTS` | 3 | 1-10 |
| `AI_BATCH_SIZE` | 15 | provider/user defaults may override |
| `AI_REQUEST_BATCH_SIZE` | 15 | clamped to batch size |
| `GROQ_AI_BATCH_SIZE` | 8 | provider-specific default |
| `GROQ_AI_REQUEST_BATCH_SIZE` | 8 | provider-specific default |

Without an active user AI key, the Settings route returns conservative processing settings of 5 rows per batch and 5 rows per request batch, and the imports route rejects uploads over 10 data rows.

## Safety And Reliability Rules

- Never trust AI summary counts.
- Never let AI invent missing contact data.
- Preserve row IDs and sheet metadata from the raw input.
- Treat malformed AI output as a soft failure and use deterministic output.
- Recompute status and missing fields after AI.
- Preserve valid contact fields from deterministic fallback if AI empties them.
- Sanitize formula-like values before export.
- Cache processed rows with a versioned key so stale cache can be invalidated by import updates.
