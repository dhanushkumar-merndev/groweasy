# GrowEasy

GrowEasy is a CRM spreadsheet cleaning app. Users upload messy lead data, choose a cleaning template, validate the raw rows, process the data with deterministic rules plus optional AI review, manually fix rows, save good records, export to Excel or Google Sheets, and build analytics/campaign views from the saved data.

The repository has two applications:

```text
.
├── groweasy/          Next.js frontend
├── backend/           Express API server
├── README.md          Product, setup, API, and file map
└── MODEL.md           AI cleaning pipeline and model/provider notes
```

## Current Architecture

```text
Browser
  |
  | Next.js pages and client components
  v
groweasy/
  | serverFetch() forwards cookies from server components
  | api() calls /api/* from client components
  v
backend/
  | Better Auth, imports, templates, tables, settings, analytics
  | Redis/Upstash cache if configured, in-memory fallback otherwise
  v
Supabase/PostgreSQL
```

The frontend performs the first upload parse in the browser for the main UI flow. It stores the draft import in IndexedDB/session storage, then sends normalized rows to the backend before processing. The backend also has direct upload endpoints that parse files server-side.

## Tech Stack

| Area | Implementation |
| --- | --- |
| Frontend | Next.js 16 App Router, React 19, TypeScript |
| Styling | Tailwind CSS 4, shadcn/ui-style primitives, Radix/Base UI pieces, lucide-react |
| Tables | TanStack Table, TanStack Virtual |
| Charts | Recharts |
| Browser parsing | ExcelJS for `.xlsx`, Papa Parse for `.csv` |
| Backend | Express 4, TypeScript, Zod, multer |
| Auth | Better Auth with Google OAuth and multi-session support |
| Database | Supabase/PostgreSQL through Supabase service client and Kysely for Better Auth |
| Cache | Upstash Redis REST when configured, process-local Map fallback |
| AI | Cloudflare Workers AI, CommandCode, Groq, plus deterministic fallback |
| Package manager | pnpm |

## Main Features

### Upload And Validation

- Browser upload supports `.csv` and `.xlsx` files up to 10 MB.
- Backend upload supports `.xlsx`, `.csv`, and `.tsv` files up to 10 MB.
- Up to 5 files can be staged in the browser upload UI.
- The frontend stores upload drafts in `sessionStorage` and IndexedDB so users can move through the wizard without losing parsed rows.
- Validation options include blank-row removal, dash-to-blank cleanup, requiring both email and phone, AI description generation, and spelling correction.
- Default API mode is limited to 10 data rows per upload. Larger processing requires a user-saved AI API key enabled in Settings.

### Cleaning Pipeline

- Templates define target CRM columns, source hints, required flags, export titles, and formatting rules.
- Deterministic cleaning runs before AI for every row.
- AI is used only for rows that need semantic mapping/review or optional description/spelling work.
- Processing can stream progress through Server-Sent Events at `/api/imports/:id/stream`.
- The review workspace keeps editable cleaned rows and AI change notes.

### Templates

- The system template is `Grow Easy CRM`, owned by the special `system` user and locked from edit/delete.
- Users can create, edit, and delete their own templates.
- Successful imports teach new source hints back into the template.

### Saved Tables, Campaigns, And Exports

- Good rows can be saved into `saved_rows`.
- Saved rows can be browsed, searched, edited, appended, deleted, exported, and grouped into campaigns.
- Excel export supports multiple modes including all good rows, same tabs, selected sheet, filtered, and missing summary.
- Google Sheets export/import endpoints exist for service-account based integration.

### Analytics

- Analytics builds chart suggestions from saved CRM data.
- It uses deterministic chart layout first and optionally asks AI for 4-8 business-useful chart blocks.
- Supported chart types are line, area, bar, vertical bar, horizontal bar, pie, radar, and radial bar.

## Local Setup

### Requirements

- Node.js 22 or newer
- pnpm
- Supabase/PostgreSQL for persistent auth and app data
- Upstash Redis REST credentials if you want cross-process cache persistence
- Google OAuth credentials for real login
- At least one AI provider key for production-scale AI processing

### Backend Environment

Create `backend/.env` from `backend/.env.example`.

Important variables:

```env
PORT=4000
FRONTEND_URL=http://localhost:3000

DATABASE_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

BETTER_AUTH_SECRET=replace-with-a-long-random-secret
BETTER_AUTH_URL=http://localhost:4000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

ENCRYPTION_KEY=replace-with-64-hex-chars

UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

AI_PROCESS_PROVIDER=cloudflare
AI_PROCESS_MODEL=@cf/google/gemma-4-26b-a4b-it
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ACCOUNT_ID=...

GROQ_API_KEY=...
COMMAND_CODE_API_KEY=...
COMMAND_CODE_BASE_URL=https://api.commandcode.ai/provider/v1
```

Notes:

- `BETTER_AUTH_SECRET` is required in production.
- `DATABASE_URL` is required for real Better Auth persistence.
- `ENCRYPTION_KEY` is used to encrypt user API keys at rest. Generate one with `openssl rand -hex 32`.
- Redis is optional. Without Redis, the backend uses an in-memory cache that disappears on restart.
- AI keys are optional for small deterministic/demo behavior, but uploads over 10 data rows require an active user API key in Settings.

### Frontend Environment

Create `groweasy/.env` from `groweasy/.env.example`.

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

The backend default port is `4000`. If your local `.env.example` says `5000`, change it to match the running backend or set `PORT=5000` in `backend/.env`.

### Install And Run

Use two terminals:

```bash
cd backend
pnpm install
pnpm dev
```

```bash
cd groweasy
pnpm install
pnpm dev
```

Default URLs:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:4000/api/health`

### Database Setup

Apply the schema to Supabase/PostgreSQL:

```bash
psql "$DATABASE_URL" < groweasy/supabase/schema.sql
```

The schema creates app tables, indexes, and row-level security policies. The migration folder also contains reset/additive migrations used during development.

## Database Model

The primary schema is [groweasy/supabase/schema.sql](/mnt/Secondary/video/assignment/groweasy/supabase/schema.sql).

| Table | Purpose |
| --- | --- |
| `templates` | User templates and the locked system template definition. |
| `imports` | One row per upload/import job with lifecycle status and aggregate counts. |
| `import_sheets` | Sheet-level metadata and counts for each import. |
| `saved_rows` | Final persisted CRM rows with cleaned data and AI changes. |
| `history_logs` | Audit entries for uploads, processing, saves, deletes, and exports. |
| `analytics_views` | Stored chart view definitions. |
| `user_ai_settings` | Provider/model/key settings, encrypted key, review mode, batch sizes. |
| `campaigns` | Named groups of saved row IDs. |

RLS is enabled for the app tables. Policies scope user-owned records by `auth.uid()::text = user_id`. `import_sheets` uses parent `imports.user_id` checks.

## Backend API

All app routes are mounted in [backend/src/app.ts](/mnt/Secondary/video/assignment/backend/src/app.ts). Responses are JSON unless an endpoint streams SSE or returns an Excel file.

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/health` | GET | Health check. |
| `/api/auth/config` | GET | Auth/Redis/Groq configuration status for the frontend. |
| `/api/auth/me` | GET | Current user from Better Auth cookies. |
| `/api/auth/*` | ALL | Better Auth handler routes. |
| `/api/templates` | GET | List visible templates for the current user. |
| `/api/templates` | POST | Create a user template. |
| `/api/templates/:id` | GET | Fetch one template. |
| `/api/templates/:id` | PATCH | Update a user-owned template. |
| `/api/templates/:id` | DELETE | Delete a user-owned template. |
| `/api/imports` | GET | List imports. |
| `/api/imports` | POST | Server-side file upload and parse. |
| `/api/imports/batch` | POST | Programmatic import from already-parsed rows. |
| `/api/imports/:id` | GET | Import detail, template, sheets, validation, cleaned and saved rows. |
| `/api/imports/:id/validate` | POST | Persist validation options and normalized rows. |
| `/api/imports/:id/process` | POST | Process rows without SSE. |
| `/api/imports/:id/stream` | GET | Process rows with SSE progress events. |
| `/api/imports/:id/results` | GET | Fetch processed cleaned rows. |
| `/api/imports/:id/save` | POST | Save selected or processed good rows. |
| `/api/imports/:id/export/excel` | POST | Download Excel export. |
| `/api/imports/:id/export/google-sheet` | POST | Export saved rows to Google Sheets. |
| `/api/tables/all` | GET | List all saved rows for campaign/table views. |
| `/api/tables/:importId/rows` | GET | List saved rows for one import, with paging/filtering. |
| `/api/tables/:importId/rows` | POST | Append a saved row. |
| `/api/tables/:importId/rows/:rowId` | PATCH | Update saved row `cleaned_data`. |
| `/api/tables/:importId/rows/:rowId` | DELETE | Delete a saved row. |
| `/api/settings/apikey` | GET | Check masked user AI key state. |
| `/api/settings/apikey` | POST | Save encrypted user provider/model/key. |
| `/api/settings/apikey` | DELETE | Remove user AI key. |
| `/api/settings/apikey/mode` | POST | Toggle whether the user key is active. |
| `/api/settings/review-mode` | POST | Toggle detailed AI change output. |
| `/api/settings/ai` | GET | Read AI batch settings and recommendations. |
| `/api/settings/ai` | POST | Update batch size and request batch size. |
| `/api/analytics/suggest-chart` | POST | Return deterministic or AI chart suggestions. |
| `/api/campaigns` | GET | List campaigns. |
| `/api/campaigns` | POST | Create campaign. |
| `/api/campaigns/:campaignId` | DELETE | Delete campaign. |
| `/api/campaigns/:campaignId/rows` | POST | Add rows to campaign. |
| `/api/campaigns/:campaignId/rows/:rowId` | DELETE | Remove one row from campaign. |
| `/api/google-sheets/export` | POST | Standalone Google Sheets export route. |
| `/api/google-sheets/import` | POST | Google Sheets import route. |
| `/api/history` | GET | List history entries, optionally filtered by type. |
| `/api/clean-batch` | POST | External/programmatic clean-batch API. |

## Import Lifecycle

1. The browser upload UI parses CSV/XLSX files with [raw-batch-parser.ts](/mnt/Secondary/video/assignment/groweasy/src/lib/raw-batch-parser.ts).
2. Parsed rows and file metadata are saved to IndexedDB through [local-import-store.ts](/mnt/Secondary/video/assignment/groweasy/src/lib/local-import-store.ts).
3. The validate page normalizes rows with [local-validation-preview.ts](/mnt/Secondary/video/assignment/groweasy/src/lib/local-validation-preview.ts).
4. Before processing, the frontend posts validation rows/options to `/api/imports/:id/validate`.
5. The process page opens `/api/imports/:id/stream?force=1` with `EventSource`.
6. The backend runs [excel-cleaner.ts](/mnt/Secondary/video/assignment/backend/src/server/ai/excel-cleaner.ts), stores cleaned rows in cache/store, updates import counts, and emits SSE events.
7. The review/export pages fetch `/api/imports/:id/results`, allow user edits, save rows, and export.

## Frontend File Map

### App Routes

| Path | File | Role |
| --- | --- | --- |
| `/` | [groweasy/src/app/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/page.tsx) | Entry route. |
| `/login` | [groweasy/src/app/login/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/login/page.tsx) | Google OAuth login UI. |
| `/dashboard` | [groweasy/src/app/dashboard/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/dashboard/page.tsx) | Dashboard shell and summary data. |
| `/upload` | [groweasy/src/app/upload/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/upload/page.tsx) | Upload start page. |
| `/upload/[importId]` | [groweasy/src/app/upload/[importId]/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/upload/[importId]/page.tsx) | Import workspace route. |
| `/upload/[importId]/validate` | [groweasy/src/app/upload/[importId]/validate/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/upload/[importId]/validate/page.tsx) | Raw validation options. |
| `/upload/[importId]/preview` | [groweasy/src/app/upload/[importId]/preview/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/upload/[importId]/preview/page.tsx) | Raw row preview. |
| `/upload/[importId]/process` | [groweasy/src/app/upload/[importId]/process/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/upload/[importId]/process/page.tsx) | SSE processing screen. |
| `/upload/[importId]/review` | [groweasy/src/app/upload/[importId]/review/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/upload/[importId]/review/page.tsx) | Cleaned row review workspace. |
| `/upload/[importId]/export` | [groweasy/src/app/upload/[importId]/export/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/upload/[importId]/export/page.tsx) | Export actions. |
| `/templates` | [groweasy/src/app/templates/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/templates/page.tsx) | Template list. |
| `/templates/new` | [groweasy/src/app/templates/new/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/templates/new/page.tsx) | New template form. |
| `/templates/[templateId]` | [groweasy/src/app/templates/[templateId]/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/templates/[templateId]/page.tsx) | Template detail. |
| `/templates/[templateId]/edit` | [groweasy/src/app/templates/[templateId]/edit/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/templates/[templateId]/edit/page.tsx) | Edit template. |
| `/tables` | [groweasy/src/app/tables/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/tables/page.tsx) | Saved table overview. |
| `/tables/[importId]` | [groweasy/src/app/tables/[importId]/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/tables/[importId]/page.tsx) | Saved rows for one import. |
| `/campaigns` | [groweasy/src/app/campaigns/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/campaigns/page.tsx) | Campaign list and row grouping. |
| `/campaigns/[templateId]` | [groweasy/src/app/campaigns/[templateId]/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/campaigns/[templateId]/page.tsx) | Campaign/template scoped view. |
| `/analytics` | [groweasy/src/app/analytics/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/analytics/page.tsx) | Analytics entry. |
| `/analytics/[templateId]` | [groweasy/src/app/analytics/[templateId]/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/analytics/[templateId]/page.tsx) | Template-scoped analytics. |
| `/history` | [groweasy/src/app/history/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/history/page.tsx) | Import/export history. |
| `/settings` | [groweasy/src/app/settings/page.tsx](/mnt/Secondary/video/assignment/groweasy/src/app/settings/page.tsx) | AI key and batch settings. |

### Important Frontend Modules

| File/group | Purpose |
| --- | --- |
| [groweasy/src/lib/api-client.ts](/mnt/Secondary/video/assignment/groweasy/src/lib/api-client.ts) | Browser fetch helper for `/api/*` with credentials. |
| [groweasy/src/lib/server-api.ts](/mnt/Secondary/video/assignment/groweasy/src/lib/server-api.ts) | Server component fetch helper that forwards Better Auth cookies. |
| [groweasy/src/lib/types.ts](/mnt/Secondary/video/assignment/groweasy/src/lib/types.ts) | Shared data types mirrored from backend. |
| [groweasy/src/lib/schemas.ts](/mnt/Secondary/video/assignment/groweasy/src/lib/schemas.ts) | Frontend validation schemas. |
| [groweasy/src/lib/formatting.ts](/mnt/Secondary/video/assignment/groweasy/src/lib/formatting.ts) | Client-side formatting helpers. |
| [groweasy/src/lib/client-cache.ts](/mnt/Secondary/video/assignment/groweasy/src/lib/client-cache.ts) | Browser-side resource caching and prefetching. |
| [groweasy/src/lib/idb-store.ts](/mnt/Secondary/video/assignment/groweasy/src/lib/idb-store.ts) | IndexedDB wrapper used by upload/import drafts. |
| [groweasy/src/lib/upload-draft.ts](/mnt/Secondary/video/assignment/groweasy/src/lib/upload-draft.ts) | Session upload draft persistence and reload cleanup. |
| [groweasy/src/lib/user-storage-scope.ts](/mnt/Secondary/video/assignment/groweasy/src/lib/user-storage-scope.ts) | User-scoped local storage key helper. |
| [groweasy/src/lib/page-data.ts](/mnt/Secondary/video/assignment/groweasy/src/lib/page-data.ts) | Client loaders and prefetchers for dashboard/templates/imports/history. |
| [groweasy/src/components/upload-dropzone.tsx](/mnt/Secondary/video/assignment/groweasy/src/components/upload-dropzone.tsx) | Main upload UI and browser parse orchestration. |
| [groweasy/src/components/processing-stream-panel.tsx](/mnt/Secondary/video/assignment/groweasy/src/components/processing-stream-panel.tsx) | SSE processing UI and token/progress display. |
| [groweasy/src/components/review-workspace.tsx](/mnt/Secondary/video/assignment/groweasy/src/components/review-workspace.tsx) | Review/edit cleaned rows. |
| [groweasy/src/components/data-grid.tsx](/mnt/Secondary/video/assignment/groweasy/src/components/data-grid.tsx) | Editable cleaned data grid. |
| [groweasy/src/components/virtual-table.tsx](/mnt/Secondary/video/assignment/groweasy/src/components/virtual-table.tsx) | Virtualized saved row browser. |
| [groweasy/src/components/template-form.tsx](/mnt/Secondary/video/assignment/groweasy/src/components/template-form.tsx) | Template create/edit form. |
| [groweasy/src/components/chart-builder.tsx](/mnt/Secondary/video/assignment/groweasy/src/components/chart-builder.tsx) | Analytics chart construction UI. |
| [groweasy/src/components/ui/](/mnt/Secondary/video/assignment/groweasy/src/components/ui/button.tsx) | Reusable UI primitives. |

## Backend File Map

| File/group | Purpose |
| --- | --- |
| [backend/src/index.ts](/mnt/Secondary/video/assignment/backend/src/index.ts) | Loads env, starts Express, configures server timeouts and shutdown. |
| [backend/src/app.ts](/mnt/Secondary/video/assignment/backend/src/app.ts) | Express app, CORS, security headers, logging, rate limits, route mounting. |
| [backend/src/middleware/auth.ts](/mnt/Secondary/video/assignment/backend/src/middleware/auth.ts) | Current-user requirement and auth helpers. |
| [backend/src/middleware/error-handler.ts](/mnt/Secondary/video/assignment/backend/src/middleware/error-handler.ts) | Global error response handling. |
| [backend/src/server/api.ts](/mnt/Secondary/video/assignment/backend/src/server/api.ts) | JSON helpers and Zod parsing. |
| [backend/src/server/auth/auth.ts](/mnt/Secondary/video/assignment/backend/src/server/auth/auth.ts) | Better Auth + Google OAuth + multi-session config. |
| [backend/src/server/db/supabase.ts](/mnt/Secondary/video/assignment/backend/src/server/db/supabase.ts) | Supabase service client creation. |
| [backend/src/server/db/db-history.ts](/mnt/Secondary/video/assignment/backend/src/server/db/db-history.ts) | History persistence helpers. |
| [backend/src/server/repositories/store.ts](/mnt/Secondary/video/assignment/backend/src/server/repositories/store.ts) | Main repository facade over memory, cache, and Supabase sync. |
| [backend/src/server/redis/cache.ts](/mnt/Secondary/video/assignment/backend/src/server/redis/cache.ts) | Redis/in-memory cache keys, TTLs, invalidation. |
| [backend/src/server/imports/parser.ts](/mnt/Secondary/video/assignment/backend/src/server/imports/parser.ts) | Backend XLSX/CSV/TSV parser and validation warnings. |
| [backend/src/server/imports/export.ts](/mnt/Secondary/video/assignment/backend/src/server/imports/export.ts) | Excel export builder. |
| [backend/src/server/imports/source-hints.ts](/mnt/Secondary/video/assignment/backend/src/server/imports/source-hints.ts) | Learns source hints from successful imports. |
| [backend/src/server/imports/summary.ts](/mnt/Secondary/video/assignment/backend/src/server/imports/summary.ts) | Rebuilds import summaries from actual row arrays. |
| [backend/src/server/ai/excel-cleaner.ts](/mnt/Secondary/video/assignment/backend/src/server/ai/excel-cleaner.ts) | Main deterministic + AI row processing engine. |
| [backend/src/server/ai/prompts/excel-cleaner.ts](/mnt/Secondary/video/assignment/backend/src/server/ai/prompts/excel-cleaner.ts) | Prompt version and CRM cleaner system prompt. |
| [backend/src/server/ai/prompts/clean-batch.ts](/mnt/Secondary/video/assignment/backend/src/server/ai/prompts/clean-batch.ts) | Legacy/external clean-batch prompt text. |
| [backend/src/server/google/sheets.ts](/mnt/Secondary/video/assignment/backend/src/server/google/sheets.ts) | Google Sheets import/export implementation. |
| [backend/src/lib/types.ts](/mnt/Secondary/video/assignment/backend/src/lib/types.ts) | Backend domain types. |
| [backend/src/lib/schemas.ts](/mnt/Secondary/video/assignment/backend/src/lib/schemas.ts) | Zod request/response schemas. |
| [backend/src/lib/formatting.ts](/mnt/Secondary/video/assignment/backend/src/lib/formatting.ts) | Deterministic cleaning, extraction, formatting, missing-field detection. |
| [backend/src/lib/default-template.ts](/mnt/Secondary/video/assignment/backend/src/lib/default-template.ts) | Locked default Grow Easy CRM template. |
| [backend/src/lib/crypto.ts](/mnt/Secondary/video/assignment/backend/src/lib/crypto.ts) | Encryption/decryption for user API keys. |
| [backend/src/lib/logger.ts](/mnt/Secondary/video/assignment/backend/src/lib/logger.ts) | Pino logger. |
| [backend/src/routes/](/mnt/Secondary/video/assignment/backend/src/routes/imports.ts) | Express route modules for auth, imports, templates, tables, analytics, settings, campaigns, Google Sheets, history, clean-batch. |

## Validation And Limits

| Limit/behavior | Value |
| --- | --- |
| Backend JSON body limit | 25 MB |
| Upload file limit | 10 MB |
| Browser upload file count | 5 files |
| Browser row hard limit | 10,000 rows |
| Default API row limit without active user key | 10 data rows |
| General API rate limit | `RATE_LIMIT_PER_MINUTE`, default 300/min |
| Auth API rate limit | `AUTH_RATE_LIMIT_PER_MINUTE`, default 60/min |
| Concurrent AI imports | `AI_MAX_CONCURRENT_IMPORTS`, default 3 |
| Cache TTL for import payloads | 24 hours |
| User list cache TTL | 120 seconds |
| Auth user cache TTL | 30 minutes backend, 10 minutes frontend server helper |

## Scripts

Backend:

```bash
pnpm dev        # tsx watch src/index.ts
pnpm build      # tsc
pnpm start      # node dist/index.js
pnpm typecheck  # tsc --noEmit
```

Frontend:

```bash
pnpm dev        # next dev --webpack
pnpm build      # next build --webpack
pnpm start      # next start
pnpm lint       # eslint
pnpm typecheck  # tsc --noEmit
```

## Production Notes

- Set `NODE_ENV=production`.
- Set a strong `BETTER_AUTH_SECRET`.
- Configure `FRONTEND_URL` to the production frontend origin. Multiple origins can be comma-separated.
- Set `BETTER_AUTH_URL` to the backend/auth origin.
- Configure Google OAuth callback URLs for the deployed backend.
- Use Supabase service role credentials only on the backend.
- Use Redis/Upstash in production if you run more than one backend process.
- Keep `ENCRYPTION_KEY` stable; changing it prevents decrypting existing user AI keys.
- Make sure `groweasy/.env` points `NEXT_PUBLIC_BACKEND_URL` at the deployed backend.

## AI Details

The AI and deterministic cleaning architecture is documented in [MODEL.md](/mnt/Secondary/video/assignment/MODEL.md).
