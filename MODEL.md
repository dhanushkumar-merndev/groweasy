# AI Pipeline Documentation

## Architecture Overview

GrowEasy uses a **hybrid deterministic + AI cleaning pipeline**. Deterministic code handles 90%+ of spreadsheet row cleaning; AI is reserved for ambiguous cases only: messy header mapping, unclear columns, confusing notes, spelling corrections, and description generation.

```
Raw rows → Deterministic cleaning → AI if needed → Merge → Final output
              (local rules only)    (via Groq / CommandCode / Cloudflare)
```

**Core principle**: Never trust AI-generated summaries. Always rebuild counts and statistics from actual row arrays.

---

## 1. Cleaning Pipeline

### Phase 1: Deterministic Local Cleaning

All rows pass through `cleanRowsWithTemplate()` first. This does **not call any AI**.

**Step-by-step**:
1. `findSourceValue()` — Match raw spreadsheet headers to template columns using normalized keys, synonyms, and learned source hints
2. `extractTargetValue()` — Extract structured data from raw values:
   - **Email**: Regex extraction, find first valid email, lowercase
   - **Indian mobile**: Collect digits from phone-like text (10-14 total), take last 10 if starts with 6-9
   - **Country code**: Extract `+91` or similar
   - **Location splitting**: Split "Pune Maharashtra India" → city, state, country
   - **Dates**: Parse multiple formats, validate real calendar dates
3. `sanitizeCellValue()` — Remove placeholders (`-`, `--`, `N/A`, `null`, etc.), formula markers (`=` prefix), JSON-like noise
4. `applyFormattingRules()` — Apply template's format rules (title case, uppercase, digits only, date formatting, etc.)
5. `getMissingFieldsForTemplate()` — Check required fields + smart contact logic (require both email+phone, or require at least one)

**Row classification after Phase 1**:
- `good` — All required fields present
- `missing` — At least one required field empty, but identity/contact fields exist
- `skipped` — No valid name, email, or mobile; unusable row

### Phase 2: AI Processing

Rows that need AI:
- `missing` rows (needs AI to find data in messy fields)
- `skipped` rows (needs AI to make sense of unstructured data)
- Good rows with `correctSpelling=true` (semantic review)
- Good rows with `generateDescription=true` (CRM note generation)
- Good rows when `AI_REVIEW_GOOD_ROWS=true` (env-driven review)

Rows are processed in **batches** (default: 15 rows, configurable per user). Within each batch, rows are further split into sub-chunks per API call.

### Phase 3: Result Merging

1. AI results (`aiRowsById`) override deterministic results where AI produced output
2. `finalizeCleanedRow()` applies local spelling corrections, generates descriptions
3. `normalizeAiRow()` validates AI output: contact columns preserved from fallback if AI emptied them, spurious changes filtered
4. Status recalculated with same deterministic rules (never trust AI status)
5. Summary rebuilt from final arrays (never use AI's summary object)

---

## 2. AI Providers

### Provider Chain

| Provider | Default Model | API Base | Auth |
|----------|--------------|----------|------|
| Cloudflare Workers AI | `@cf/google/gemma-4-26b-a4b-it` | Built-in | API token + account ID |
| CommandCode | `deepseek/deepseek-v4-pro` | `https://api.commandcode.ai/provider/v1` | API key |
| Groq | `openai/gpt-oss-120b` | SDK | API key |

**Default provider**: Cloudflare Workers AI (configurable via `AI_PROCESS_PROVIDER`)

**Fallback**: CommandCode falls back to `llama-3.3-70b-versatile` if primary model fails. New keys are cycled automatically.

### Provider Detection

```ts
normalizeAiProvider(provider): "groq" | "commandcode" | "cloudflare"

"cloudflare" / "workersai" → cloudflare
"commandcode"           → commandcode
anything else           → groq (default)
```

### Model Validation

Each provider validates that the configured model belongs to it. If a mismatch is detected, the provider's default model is used instead.

---

## 3. Prompt Design

### Excel Cleaner Prompt (`excel-cleaner.ts`)

**Version**: `excel-cleaner-v12`

**Hard rules**:
- Return ONLY valid JSON (no markdown, no fences, no comments)
- First character must be `{`, last must be `}`
- Each row must have: `id`, `cleaned_data`, `status`, `missing_fields`, `ai_changes`
- `cleaned_data` must use template keys only
- Map messy headers by meaning, not exact spelling
- Never invent name/email/phone — if absent, output empty string

**Smart rules**:
- Contact cells may contain email+phone+whatsapp+notes together — extract each independently
- Location cells may contain city/state/country together — split when clear
- Notes: keep useful CRM text, remove contact labels/noise, no raw email/phone blobs
- Description generation: natural row-specific CRM note under 100 chars

**Format rules applied**:
- `date_dd_mm_yyyy` → DD/MM/YYYY (strip time)
- `last_10_digits` → Indian mobile 10-digit extraction (must start 6-9)
- `title_case`, `lowercase`, `uppercase`, `digits_only`, `dash_to_blank`

**Spelling correction** (`correctSpelling=true`):
- Fix obvious spelling mistakes in names, city, state, country, source, project, status, owner, notes, description
- Only when the intended word is clear
- Do not rewrite meaning or invent new facts

**Description generation** (`generateDescription=true`):
- Every good row gets a natural, row-specific CRM note under 100 chars
- Use only that row's data: name, project, CRM note, city, source, possession time, contact availability
- No fixed template, no repeated sentence patterns, no raw contact blobs

### Clean Batch Prompt (`clean-batch.ts`)

**Version**: `clean-batch-groq-v1`

**Purpose**: Legacy endpoint that sends **headers + 5-10 sample rows** to AI for field mapping, then applies the mapping deterministically to all rows.

**Mapping rules**: 20+ explicit header-to-column mappings:
- `Created Time, Created At, Lead Date` → `created_at`
- `Name, Full Name, Customer Name` → `name`
- `Phone, Mobile, Contact Details` → `mobile`
- `Remarks, Notes, CRM Note` → `crm_note`
- `Location` → `city`, `state`, `country` (split)
- etc.

**Self-check**: AI must verify:
- `total_input_rows = input.rows.length` only (never use source_row_index)
- Sum of good + missing + skipped = total input
- No duplicate rows, no wrong arrays
- Summary counts match arrays exactly

---

## 4. Retry & Error Handling

### Exponential Backoff

```
Attempt 1: wait 0ms
Attempt 2: wait 2s
Attempt 3: wait 4s
...
Max 6 attempts (CommandCode), 2 attempts (others)
```

### Key Rotation

Multiple API keys are supported per provider. On failure, the system rotates to the next key in the chain. User API keys take priority over system keys.

```ts
getAiApiKeys(provider):
  cloudflare:  CLOUDFLARE_API, CLOUDFLARE_API_TOKEN, CLOUDFLARE_API_KEY
  commandcode: COMMAND_CODE_API_KEY, COMMANDCODE_API_KEY
  groq:        GROQ_API_KEY

  + user's personal API key (encrypted, decrypted at runtime)
```

### Empty Response Recovery

If AI returns empty or malformed JSON:
1. The row falls back to deterministic local result
2. All contact fields preserved from local fallback
3. Status recalculated deterministically
4. Problem logged as warning (not error)

### Summary Rebuild Is Mandatory

> **Never trust AI-generated summaries.**

```ts
rebuildSummary(result, rawBatch):
  total_input_rows = rawBatch.rows.length           // NOT source_row_index max
  good_count = goodRows.length                       // Count from array
  missing_count = missingRows.length                 // Count from array
  skipped_count = skippedRows.length                 // Count from array
  ai_changed_row_count = rows where ai_changes.length > 0
  ai_changed_cell_count = total ai_changes objects
```

---

## 5. Batch Processing

| Parameter | Default | Env Var | Range |
|-----------|---------|---------|-------|
| Batch size | 15 | User setting `aiBatchSize` | 1-100 |
| Request batch size | 5 | `AI_REQUEST_BATCH_SIZE` | 1-50 |
| Parallel batches | 1 | `AI_PARALLEL_BATCHES` | 1-10 |
| Max retries | 2 | `AI_MAX_RETRIES` | 0-10 |
| Max completion tokens | 2048 | `AI_MAX_COMPLETION_TOKENS` | 512-8192 |
| Timeout (CommandCode) | 25s | `COMMAND_CODE_AI_TIMEOUT_MS` | 5s-120s |
| Timeout (Cloudflare) | 60s | `CLOUDFLARE_AI_TIMEOUT_MS` | 10s-120s |

---

## 6. SSE Streaming

The import processing route (`/api/imports/:id/stream-process`) uses **Server-Sent Events** for real-time progress.

Each batch sends two events:

**`batch:start`**:
```json
{
  "batchNo": 1,
  "totalBatches": 10,
  "batchRows": 15,
  "aiRows": 3,
  "model": "cloudflare/@cf/google/gemma-4-26b-a4b-it"
}
```

**`batch:complete`**:
```json
{
  "processedRows": 100,
  "totalRows": 150,
  "good": 80,
  "missing": 15,
  "skipped": 5,
  "tokenUsage": { "prompt_tokens": 4000, "completion_tokens": 800 }
}
```

---

## 7. Configuration Workflow

### User AI Settings

Each user can configure:
- **API Key**: Personal Groq/CommandCode/Cloudflare key (removes default row limit)
- **Provider**: Override default provider
- **Model**: Override default model
- **Batch Size**: Rows per local batch (default 15)
- **Request Batch Size**: Rows per API call (default 5)

### Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `AI_PROCESS_PROVIDER` | Default provider (groq/commandcode/cloudflare) | No |
| `AI_PROCESS_MODEL` | Default model | No |
| `GROQ_API_KEY` | Groq system API key | No |
| `COMMAND_CODE_API_KEY` | CommandCode system API key | No |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Workers AI token | No |
| `CLOUDFLARE_AI_ACCOUNT_ID` | Cloudflare account ID | No |
| `AI_MAX_RETRIES` | Max retry attempts (default 2) | No |
| `AI_MAX_COMPLETION_TOKENS` | Token limit per request (default 2048) | No |
| `AI_REVIEW_GOOD_ROWS` | Review already-good rows with AI (default true) | No |
| `AI_BATCH_SIZE` | Rows per batch (default 15) | No |
| `AI_REQUEST_BATCH_SIZE` | Rows per API call (default 5) | No |
| `AI_PARALLEL_BATCHES` | Concurrent batch processing (default 1) | No |
| `COMMAND_CODE_BASE_URL` | CommandCode API base URL | No |
| `COMMAND_CODE_AI_TIMEOUT_MS` | Request timeout (default 25000) | No |
| `CLOUDFLARE_AI_TIMEOUT_MS` | Request timeout (default 60000) | No |

---

## 8. Rate Limits & Performance

### Groq (per key)
| Limit | Value |
|-------|-------|
| Requests | 30/min, 1,000/day |
| Tokens | 8,000/min, 200,000/day |

With 3 keys in the fallback chain: ~24,000 tokens/min, 600,000 tokens/day (theoretical ceiling). Each single request still must fit within the per-key TPM limit — one oversized request is rejected before fallback can help.

### Cost Optimization

- Deterministic cleaning is **free** (no API calls)
- AI invocation is limited to problematic rows only
- Non-AI-key users limited to 10 rows
- Rows with zero AI changes skip the API entirely
- Compact review mode saves tokens: `ai_changes: []` for all rows

---

## 9. Deterministic Mode

When no AI API key is configured:
- **No AI calls at all**
- Deterministic cleaning runs normally (email extraction, mobile validation, format rules, etc.)
- `modelUsed: "demo-local-cleaner"`
- All rows classified deterministically
- Description generation skipped
- Spelling correction uses local dictionary only
- Chart suggestions use deterministic layout engine only

---

## 10. Prompt Versioning

Prompts are versioned in the code using constants:
- `EXCEL_CLEANER_PROMPT_VERSION = "excel-cleaner-v12"`
- `CLEAN_BATCH_PROMPT_VERSION = "clean-batch-groq-v1"`

The active version is logged on every AI processing run in the history. This allows tracking which prompt version produced which results.

---

## 11. Source Hint Learning

After each successful import, the system learns which raw spreadsheet headers mapped to which template columns:

1. Compare raw row data with final cleaned data
2. Score each raw header by how often it maps to each template column
3. Add top 3 unmatched headers as source hints (max 24 per column)
4. Source hints improve future `findSourceValue()` matching

This means the deterministic matcher **improves over time** without requiring manual source hint configuration.

---

## 12. Chart Suggestion AI

Separate from the cleaning pipeline. Chart suggestions use the same multi-provider AI chain:

1. Column profiles computed (unique values, data types, distributions)
2. AI receives: column profiles, sample rows, template columns
3. AI returns: 4-8 chart configurations (type, axes, layout)
4. Post-processing: diversify chart types, ensure no duplicate axes
5. Fallback: deterministic `suggestChartLayout()` if AI fails

Chart types: `line`, `area`, `bar`, `vertical_bar`, `horizontal_bar`, `pie`, `radar`, `radial_bar`

Layouts: `wide` (trends, many groups), `medium` (balanced), `compact` (small splits)
