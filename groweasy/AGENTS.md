<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# AGENT.md — Production Build Instructions

## Product Name

**AI Excel Cleaner & Analytics Platform**

Build a production-ready web application where users can upload Excel/CSV files, apply saved templates, clean and format data with AI, review live streaming results, save only valid good rows, export clean Excel/Google Sheets, and analyze saved table data with AI-assisted charts.

The app must feel like a polished SaaS dashboard, not a demo.

---

## Core Goal

Create a production-quality Next.js application with:

- Google login
- Template-based Excel/CSV cleaning
- Multi-sheet Excel support
- Local validation before AI
- Real-time streaming AI batch processing
- Editable good/missing review table
- Permanent summary counts for history
- Supabase Postgres persistence
- Redis cache with TTL and invalidation
- Excel export and Google Sheets export/import support
- AI-assisted analytics and chart customization
- Mobile-first responsive UI
- Clean senior-level code with no unused imports or dead code

---

## Tech Stack

Use exactly this stack unless a dependency is clearly impossible:

```txt
Next.js App Router
TypeScript
Tailwind CSS
shadcn/ui
shadcn dashboard-01
shadcn login-05
TanStack Table
TanStack Virtual
GSAP for small page/step animations only
Supabase Postgres
Redis / Upstash Redis
Groq openai/gpt-oss-120b primary model
Groq llama-3.3-70b-versatile fallback model
xlsx package for Excel import/export
Better Auth with Google login
html-to-image or dom-to-image-more for local chart screenshot export
```

---

## Important Installation Rules

The agent must **install required shadcn components**, not manually recreate them.

Use:

```bash
npx shadcn@latest add dashboard-01
npx shadcn@latest add login-05
```

Also install normal shadcn components only through CLI when available:

```bash
npx shadcn@latest add button card input table tabs badge dropdown-menu dialog sheet separator scroll-area tooltip select checkbox progress skeleton alert form textarea sonner
```

Do not copy random component code manually if shadcn CLI can install it.

Do not reset, delete, or recreate the whole project after dependencies are installed.

Do not overwrite existing project files unless the change is required and intentional.

---

## Visual Design Direction

Use a **clean dark + white UI with green accents**.

Theme must be controlled using global CSS variables, not one-off page-specific colors.

Use `globals.css` CSS variables such as:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --primary: 151 55% 42%;
  --primary-foreground: 0 0% 100%;
  --muted: 210 40% 96%;
  --muted-foreground: 215 16% 47%;
  --border: 214 32% 91%;
  --radius: 0.9rem;
}

.dark {
  --background: 222 47% 5%;
  --foreground: 210 40% 98%;
  --primary: 151 55% 48%;
  --primary-foreground: 0 0% 100%;
  --muted: 222 34% 12%;
  --muted-foreground: 215 20% 70%;
  --border: 222 30% 18%;
}
```

Do not hardcode colors inside pages except for semantic chart colors or unavoidable UI states.

The UI should be:

- mobile-first
- clean spacing
- sticky action bars on mobile
- sidebar on desktop
- drawer/sidebar on mobile
- readable tables
- smooth transitions
- accessible contrast

---

## Code Quality Rules

Write code like a senior developer.

Required standards:

- TypeScript everywhere
- strict types for data models
- no `any` unless truly unavoidable
- no unused imports
- no unused variables
- no dead code
- clear folder structure
- reusable components
- short focused functions
- comments only where they explain non-obvious logic
- proper error handling
- loading states
- empty states
- optimistic UI only where safe
- server code must never expose secrets
- do not expose AI system prompts in frontend
- do not store private prompts in DB
- validate all server inputs with Zod
- sanitize user-provided table values
- handle large files carefully

Before finalizing, run:

```bash
npm run lint
npm run typecheck
npm run build
```

Fix all errors. Do not leave failing builds.

---

## Authentication

Use **Better Auth** with **Google Sign-In**.

Use the shadcn `login-05` layout for the login page.

Do not manually design a separate login page.

Route:

```txt
/login
```

Requirements:

- Google login button
- polished login layout using login-05
- redirect authenticated users to `/dashboard`
- redirect unauthenticated users from app pages to `/login`
- all user data must be scoped by `user_id`

Use Better Auth schema/migration as intended. Do not manually invent auth tables if Better Auth manages them.

---

## Main App Routes

Use App Router routes:

```txt
/login
/dashboard
/upload
/upload/[importId]/validate
/upload/[importId]/preview
/upload/[importId]/process
/upload/[importId]/review
/templates
/templates/new
/templates/[templateId]/edit
/tables
/tables/[importId]
/analytics
/history
/settings
```

The upload flow must be split into clear pages/steps, not one long page.

---

## Main UX Flow

The user flow must be:

```txt
1. Upload Excel/CSV
2. Select template
3. Local validation
4. Raw preview
5. AI processing with streaming batch results
6. Formatted preview/review
7. Edit good/missing rows
8. Save good/fixed rows
9. Export Excel / Google Sheet
10. View history and analytics
```

Use a left step sidebar on desktop:

```txt
Upload
Validate
Preview
AI Process
Review
Save / Export
```

Use a top progress stepper and sticky bottom action buttons on mobile.

GSAP may be used only for subtle step transitions, sidebar/drawer transitions, and progress feel. Do not overuse animation.

---

## Feature 1 — Upload

Users can upload:

```txt
.xlsx
.xls
.csv
.tsv
.ods optional
```

Upload page requirements:

- drag and drop upload
- file picker
- file size display
- selected file preview
- template selector
- checkbox: remove blank rows
- checkbox: treat dash/NA values as blank
- show sheets detected
- show total raw row count
- do not call AI at upload stage

---

## Multi-Sheet Excel Handling

If one Excel file contains multiple sheets/tabs, the app must preserve them.

Do **not** create a separate database table for each sheet.

Use one import job with many sheet names.

Each row must include:

```txt
import_id
sheet_id
sheet_name
sheet_index
row_index
raw_data
cleaned_data
status
```

Example:

```json
{
  "import_id": "imp_123",
  "sheet_name": "Facebook Leads",
  "sheet_index": 0,
  "row_index": 12,
  "raw_data": {},
  "cleaned_data": {},
  "status": "good"
}
```

UI must show:

```txt
All Sheets | Sheet 1 | Sheet 2 | Sheet 3 | Good | Missing | Skipped Summary
```

In saved table view, user must be able to view:

- all rows
- rows from individual sheet
- rows by status
- rows by search/filter

---

## Local Validation Before AI

Before sending data to AI, apply local deterministic cleanup.

Local validation must:

- remove completely blank rows if checkbox is enabled
- always remove default empty rows from Excel parsing
- detect blank sheets
- detect hidden sheets
- ignore images
- ignore macros/scripts
- sanitize risky spreadsheet formulas
- trim extra spaces
- normalize repeated whitespace
- optionally convert dash/NA-like values to blank

Dash/blank rules:

```txt
"-"       -> blank
"--"      -> blank
"---"     -> blank
"_"       -> blank if only underscores/spaces
"N/A"     -> blank
"NA"      -> blank
"null"    -> blank
"undefined" -> blank
"none"    -> blank
```

Suggested regex:

```ts
const DASH_ONLY_RE = /^[-_\s]+$/;
const NULLISH_RE = /^(na|n\/a|null|undefined|none)$/i;
```

Formula sanitization:

If a cell begins with any of these:

```txt
= + - @
```

and it looks like a spreadsheet formula, prefix with a safe apostrophe or convert to plain text before preview/export.

Do not send images/scripts/macros to AI.

Show warnings like:

```txt
3 blank sheets ignored
12 blank rows removed
2 hidden sheets detected
Formula-like cells sanitized
Images/macros ignored
```

---

## Feature 2 — Templates

Templates define how data should be cleaned, mapped, validated, and exported.

Template page requirements:

- create template
- edit template later
- add custom columns
- set source column hints
- set required fields
- set formatting rules
- set export title casing / uppercase rules
- preview sample output
- delete template
- duplicate template
- search templates

Template is not just a UI label. It controls output structure.

Template example:

```json
{
  "name": "Lead Cleaning Template",
  "columns": [
    {
      "key": "customer_name",
      "label": "Customer Name",
      "source_hints": ["name", "full name", "lead name", "customer"],
      "required": true,
      "format_rules": ["trim", "title_case", "dash_to_blank"],
      "export_title": "CUSTOMER NAME"
    },
    {
      "key": "mobile",
      "label": "Mobile",
      "source_hints": ["phone", "mobile", "contact", "number"],
      "required": true,
      "format_rules": ["digits_only", "last_10_digits"],
      "export_title": "MOBILE"
    }
  ]
}
```

Formatting rules based on the user's reference logic:

```txt
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

Use readable rule names internally. You may support short aliases if helpful, but UI should be user-friendly.

---

## Required Fields and Missing Rows

A row is **good** only if all required template fields are present after cleaning.

A row is **missing** if it has useful data but one or more required fields are missing.

A row is **skipped** if it is unusable, such as:

- no useful data
- no contact field where contact is required
- impossible to map any meaningful values
- duplicate and user selected skip duplicate

Missing rows must be editable during review.

If user fixes required fields, the row becomes good.

---

## Permanent vs Temporary Storage Rule

This is critical.

Permanent Supabase storage:

```txt
good rows
fixed missing rows
import summary counts
missing count
skipped count
duplicate count
blank row count
AI changed count
missing-by-field summary
sheet-wise summary
history logs
```

Temporary Redis storage:

```txt
raw preview rows
missing row data for editing
skipped row preview
AI batch results
formatted preview
autocomplete cache
analytics cache
```

Redis TTL:

```txt
1 day
```

Do **not** permanently save unresolved missing row data unless the user explicitly fixes/saves it.

Do permanently save missing counts and summary so history can show what happened in that upload.

Example history:

```txt
July Leads.xlsx uploaded
875 rows saved
90 rows were missing
25 missing rows fixed
60 rows skipped
```

---

## Feature 3 — AI Processing

Use Groq as primary AI provider.

Primary model:

```txt
openai/gpt-oss-120b
```

Fallback model:

```txt
llama-3.3-70b-versatile
```

AI must:

- map messy source columns to selected template columns
- clean values according to template rules
- return strict JSON
- explain changes per cell when changed
- mark missing fields
- mark skipped rows with reason
- never invent real customer data
- leave unknown/missing values blank

Do not expose system prompt in frontend.

Do not store full system prompt in DB.

Store only prompt version:

```txt
excel-cleaner-v1
```

System prompt should live in backend code, for example:

```txt
src/server/ai/prompts/excel-cleaner.ts
```

---

## AI Output Shape

The model must return valid JSON with this shape:

```ts
type AiBatchResult = {
  batch_no: number;
  rows: Array<{
    source_row_id: string;
    sheet_name: string;
    row_index: number;
    status: "good" | "missing" | "skipped";
    cleaned_data: Record<string, string | number | boolean | null>;
    missing_fields: string[];
    skip_reason?: string;
    ai_changes: Array<{
      field: string;
      before: string | null;
      after: string | null;
      reason: string;
    }>;
  }>;
  summary: {
    good_count: number;
    missing_count: number;
    skipped_count: number;
    ai_changed_count: number;
  };
};
```

If JSON is invalid, retry the batch with a repair prompt.

---

## Streaming Batch Processing

The user should not wait for all AI processing to finish.

Implement streaming batch results using **SSE / Server-Sent Events**.

Preferred API flow:

```txt
POST /api/imports
POST /api/imports/:id/process
GET  /api/imports/:id/stream
GET  /api/imports/:id/results
POST /api/imports/:id/save
```

Processing behavior:

```txt
Create import job
Split rows into batches
Process multiple batches in parallel
As each batch completes, stream result to frontend
Frontend updates tables and counts live
```

Recommended default:

```env
AI_BATCH_SIZE=75
AI_PARALLEL_BATCHES=4
AI_MAX_RETRIES=2
AI_BATCH_TIMEOUT_SECONDS=60
```

Do not start with 10 parallel batches by default. Make concurrency configurable.

SSE event examples:

```json
{
  "type": "batch_completed",
  "batch_no": 3,
  "total_batches": 18,
  "good_count": 120,
  "missing_count": 8,
  "skipped_count": 2
}
```

```json
{
  "type": "progress",
  "processed_rows": 450,
  "total_rows": 1200,
  "percent": 37
}
```

```json
{
  "type": "completed",
  "import_id": "imp_123"
}
```

Frontend must show live:

```txt
Processing batch 3 / 18
Good: 240
Missing: 12
Skipped: 5
AI changed: 180 cells
```

---

## Review Page

The review page must show:

```txt
Raw
Good
Missing
Skipped Summary
AI Changes
```

Good rows:

- editable
- can be saved
- changed cells highlighted

Missing rows:

- editable
- red required field markers
- can become good when fixed
- not permanently saved unless fixed

Skipped rows:

- count and reason summary are permanent
- row data is Redis-only preview

AI Changes tab:

- field
- before
- after
- reason
- sheet name
- row number

Visual states:

```txt
Yellow cell = AI changed
Red cell = required missing
Green row = good
Grey row = skipped
```

---

## Feature 4 — Saved Tables

Saved tables are based on imports/template-applied data, not raw templates.

Tables page:

```txt
/tables
/tables/[importId]
```

Capabilities:

- list saved imports/tables
- show table name/import name
- show template applied
- show file name
- show created date
- show total saved rows
- show missing/skipped summary
- open table
- search rows
- filter by sheet
- filter by column values
- paginate
- virtualize large rows
- edit rows
- delete rows
- append rows
- export rows

Use TanStack Table + TanStack Virtual.

Do not load thousands of rows into the DOM.

---

## Local Autocomplete

Autocomplete should be local and lightweight.

When editing a cell, suggestions should come from saved/current row values for that column.

Example:

```txt
city -> Bangalore, Chennai, Mumbai
status -> Good Lead, Bad Lead, Sale Done
source -> Facebook, Google, Website
```

Use Redis/IndexedDB/cache for unique values.

No AI is needed for simple autocomplete.

Invalidate autocomplete when:

- row edited
- row appended
- row deleted
- import saved

---

## Feature 5 — Export

Export options:

```txt
Export all good rows as one Excel sheet
Export same tabs as original Excel
Export only selected sheet
Export only filtered rows
Export missing summary
Export Google Sheet
```

Default Excel export should include:

```txt
Cleaned Data
Sheet-wise tabs if selected
Summary
```

Export must use template `export_title` values.

If template says uppercase title, export header should be uppercase.

Do not export unresolved missing rows as saved data.

---

## Google Sheets Support

Support both:

```txt
Import from Google Sheet
Export to Google Sheet
```

Google credentials and private keys must never be in frontend.

All Google auth/token logic must be server-side.

If using service account, user must share the Google Sheet with service account email.

Frontend only calls backend APIs:

```txt
POST /api/google-sheets/import
POST /api/google-sheets/export
```

---

## Feature 6 — Analytics

Analytics should be based on **saved table/import data**, not just template definitions.

Analytics flow:

```txt
Select saved import/table
Select sheet or all sheets
Apply filters
AI profiles columns
AI suggests best chart
User can switch chart type
User customizes chart in sidebar
User exports screenshot
```

Chart types:

```txt
line
bar
pie
horizontal bar
vertical bar
area
```

AI suggestion rules:

```txt
Date + count -> line chart
Category + count -> bar chart
Status percentage -> pie chart
City/state comparison -> horizontal bar
Numeric trend -> area/line chart
```

User must be able to override AI choice.

Analytics UI:

- chart canvas/card
- right customization sidebar on desktop
- bottom drawer customization on mobile
- chart title edit
- chart type switcher
- x-axis selector
- y-axis selector
- group-by selector
- filter controls
- screenshot/export button

Screenshot must be local HTML screenshot, not server screenshot.

Use:

```txt
html-to-image
```

or:

```txt
dom-to-image-more
```

---

## History

History page should show permanent count-based events.

Track:

```txt
file uploaded
AI processing started
AI processing completed
rows saved
rows added
rows deleted
missing count
skipped count
fixed missing count
duplicate count
export done
Google Sheet export done
```

History should not need unresolved missing row data.

History card example:

```txt
July Leads.xlsx uploaded
Template: Lead Cleaning Template
Total rows: 1000
Good rows saved: 875
Missing rows: 90
Fixed missing rows: 25
Skipped rows: 60
Date: 08 Jul 2026, 11:30 AM
```

---

## Redis Caching

Use Redis for temporary data and speed.

TTL default:

```txt
86400 seconds / 1 day
```

Cache keys:

```txt
prompt:excel-cleaner:v1
import:{importId}:raw:v1
import:{importId}:validation:v1
import:{importId}:formatted:v1
import:{importId}:batch:{batchNo}:v1
import:{importId}:missing:v1
import:{importId}:skipped:v1
autocomplete:{importId}:v1
analytics:{importId}:{filterHash}:v1
```

Every Redis cache value should include:

```json
{
  "cached_at": "ISO_DATE",
  "expires_at": "ISO_DATE",
  "version": "v1",
  "data": {}
}
```

Invalidation rules:

Invalidate import caches when:

- new rows appended
- row edited
- row deleted
- template formatting changed
- import saved
- AI reprocess started

Invalidate analytics caches when:

- any saved row changes
- filters change
- template/display config changes

If Redis `cached_at` is older than DB `updated_at`, ignore Redis and rebuild cache.

---

## Database Design

Use Supabase Postgres.

Use JSONB for flexible row data.

Do not create one physical SQL table per template/sheet.

Recommended tables:

```txt
templates
imports
import_sheets
saved_rows
import_summaries
history_logs
analytics_views
```

### templates

```sql
id uuid primary key default gen_random_uuid()
user_id text not null
name text not null
columns_config jsonb not null
formatting_rules jsonb default '{}'::jsonb
created_at timestamptz default now()
updated_at timestamptz default now()
```

### imports

```sql
id uuid primary key default gen_random_uuid()
user_id text not null
template_id uuid references templates(id)
file_name text not null
import_name text not null
status text not null
prompt_version text
model_used text
total_sheets int default 0
total_rows int default 0
good_count int default 0
missing_count int default 0
skipped_count int default 0
fixed_missing_count int default 0
final_saved_count int default 0
blank_rows_removed int default 0
duplicate_count int default 0
ai_changed_count int default 0
missing_by_field jsonb default '{}'::jsonb
sheet_summary jsonb default '[]'::jsonb
created_at timestamptz default now()
updated_at timestamptz default now()
```

### import_sheets

```sql
id uuid primary key default gen_random_uuid()
import_id uuid references imports(id) on delete cascade
sheet_name text not null
sheet_index int not null
total_rows int default 0
good_count int default 0
missing_count int default 0
skipped_count int default 0
created_at timestamptz default now()
```

### saved_rows

Only good/fixed rows are stored here.

```sql
id uuid primary key default gen_random_uuid()
user_id text not null
import_id uuid references imports(id) on delete cascade
sheet_id uuid references import_sheets(id) on delete set null
sheet_name text not null
sheet_index int not null
row_index int not null
cleaned_data jsonb not null
ai_changes jsonb default '[]'::jsonb
created_at timestamptz default now()
updated_at timestamptz default now()
```

### history_logs

```sql
id uuid primary key default gen_random_uuid()
user_id text not null
import_id uuid references imports(id) on delete cascade
action text not null
meta jsonb default '{}'::jsonb
created_at timestamptz default now()
```

### analytics_views

```sql
id uuid primary key default gen_random_uuid()
user_id text not null
import_id uuid references imports(id) on delete cascade
name text not null
chart_type text not null
config jsonb not null
created_at timestamptz default now()
updated_at timestamptz default now()
```

Indexes:

```sql
create index idx_templates_user_id on templates(user_id);
create index idx_imports_user_id on imports(user_id);
create index idx_imports_template_id on imports(template_id);
create index idx_saved_rows_user_id on saved_rows(user_id);
create index idx_saved_rows_import_id on saved_rows(import_id);
create index idx_saved_rows_sheet_name on saved_rows(sheet_name);
create index idx_saved_rows_cleaned_data_gin on saved_rows using gin(cleaned_data);
create index idx_history_logs_import_id on history_logs(import_id);
```

Use RLS policies so users only access their own rows.

---

## API Structure

Use server actions or route handlers carefully. Prefer route handlers for streaming/SSE.

Suggested API:

```txt
POST   /api/imports
GET    /api/imports
GET    /api/imports/:id
POST   /api/imports/:id/validate
POST   /api/imports/:id/process
GET    /api/imports/:id/stream
GET    /api/imports/:id/results
POST   /api/imports/:id/save
POST   /api/imports/:id/export/excel
POST   /api/imports/:id/export/google-sheet

GET    /api/templates
POST   /api/templates
GET    /api/templates/:id
PATCH  /api/templates/:id
DELETE /api/templates/:id

GET    /api/tables/:importId/rows
PATCH  /api/tables/:importId/rows/:rowId
DELETE /api/tables/:importId/rows/:rowId
POST   /api/tables/:importId/rows

POST   /api/analytics/suggest-chart
POST   /api/google-sheets/import
POST   /api/google-sheets/export
```

All APIs must:

- verify session
- scope data by `user_id`
- validate body with Zod
- return typed errors
- never leak secrets

---

## Frontend Components

Create reusable components:

```txt
components/app-sidebar.tsx
components/top-nav.tsx
components/mobile-stepper.tsx
components/upload-dropzone.tsx
components/template-selector.tsx
components/import-step-layout.tsx
components/sheet-tabs.tsx
components/data-grid.tsx
components/virtual-table.tsx
components/editable-cell.tsx
components/ai-change-badge.tsx
components/status-count-cards.tsx
components/processing-stream-panel.tsx
components/chart-builder.tsx
components/chart-customizer-sidebar.tsx
components/export-menu.tsx
```

Do not put all UI in one page file.

---

## Tables and Performance

Use TanStack Table + virtualization.

Required behavior:

- sticky headers
- horizontal scroll
- vertical scroll
- virtualized rows
- column resizing if reasonable
- search
- filters
- row selection
- inline edit
- local autocomplete
- loading skeleton
- empty state

Do not render thousands of rows normally.

---

## Error Handling

Handle:

- invalid file type
- corrupted Excel file
- empty workbook
- no usable rows
- too many rows warning
- AI timeout
- AI invalid JSON
- fallback model used
- Redis unavailable
- Supabase error
- Google Sheet permission denied
- network disconnect during SSE

Use user-friendly messages with retry buttons where needed.

---

## Environment Variables

Use `.env.local`:

```env
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
REDIS_URL=
GROQ_API_KEY=
PRIMARY_AI_MODEL=openai/gpt-oss-120b
FALLBACK_AI_MODEL=llama-3.3-70b-versatile
AI_BATCH_SIZE=75
AI_PARALLEL_BATCHES=4
AI_MAX_RETRIES=2
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_SHEETS_CLIENT_EMAIL=
GOOGLE_SHEETS_PRIVATE_KEY=
```

Never expose service role keys, Google private keys, or AI keys to frontend.

---

## Build Order

Implement in this order:

1. Project setup and shadcn theme
2. Better Auth Google login using login-05
3. Dashboard layout using dashboard-01
4. Supabase DB schema and RLS
5. Template CRUD
6. Excel upload and multi-sheet parser
7. Local validation and raw preview
8. Redis preview cache
9. AI batch processing with SSE streaming
10. Review page with good/missing/skipped tabs
11. Save only good/fixed rows
12. Export Excel
13. Saved tables with virtualization
14. History counts
15. Google Sheets import/export
16. Analytics chart suggestion and customization
17. Screenshot export
18. Final lint/typecheck/build cleanup

---

## Acceptance Criteria

The app is complete only when:

- Google login works
- logged-out users cannot access app routes
- user can create/edit templates
- user can upload Excel with multiple sheets
- local validation runs before AI
- raw preview works
- AI processing streams live batch results
- good/missing/skipped counts update live
- AI changes are visible in review
- missing rows are editable
- fixed missing rows can become good
- only good/fixed rows are permanently saved
- missing/skipped counts are permanently saved
- unresolved missing row data is Redis-only
- saved table view supports sheet filtering
- large tables use virtualization
- Excel export works
- analytics runs from saved table/import data
- user can switch chart types
- local screenshot export works
- Redis invalidation works when rows change
- UI is mobile-friendly
- app uses global CSS variables for theme
- no unused imports
- no dead code
- build passes

---

## Final Reminder for the Coding Agent

Do not build this like a quick prototype.

Build it like a production SaaS:

- small typed modules
- reusable components
- clear server/client boundaries
- safe secrets handling
- robust validation
- streaming UX
- clean responsive design
- no dead code
- no unused imports
- comments only where useful
