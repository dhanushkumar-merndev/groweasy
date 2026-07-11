# GrowEasy

CRM data cleaning and processing SaaS — upload messy spreadsheets, map columns with AI, review and fix data, then export to Excel or Google Sheets.

## Architecture

```
├── groweasy/          Next.js 16 App Router (React 19, Tailwind 4, shadcn/ui)
├── backend/           Express 4 API (TypeScript, Kysely, PostgreSQL/Supabase)
```

**Pattern**: Next.js calls Express via `fetch`. Server components use `serverFetch()` with cookie forwarding; client components use browser `fetch` with `credentials: "include"`. AI processing streams real-time progress via SSE.

### Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Radix UI |
| Tables | @tanstack/react-virtual, @tanstack/react-table |
| Charts | Recharts |
| Backend | Express 4, TypeScript, Kysely |
| Auth | Better Auth v1 + Google OAuth + multi-session |
| Database | PostgreSQL (Supabase) + Redis (Upstash) + in-memory fallback |
| AI | Groq / CommandCode / Cloudflare Workers AI (multi-provider with fallback) |
| Package | pnpm |

## Features

### Data Cleaning Pipeline
1. **Upload** — Excel, CSV, TSV, ODS files with multi-sheet support, up to 50MB
2. **Validate** — Client-side preview showing raw rows, blank row removal, dash-to-blank, email/phone requirements
3. **Preview** — Sheet tabs, row counts, column mapping view
4. **AI Process** — Streaming batch progress via SSE, rows classified as good/missing/skipped
5. **Review** — Side-by-side editable workspace with AI change tracking, sessionStorage drafts
6. **Export** — Excel download or Google Sheets push

### Templates
- Define target CRM schema: columns, formatting rules, required fields
- 21 formatting rules (title case, digits only, date formatting, country code prefixing, etc.)
- Source hints auto-learned from successful imports
- Create, edit, delete custom templates; system template locked

### Analytics
- AI-powered chart suggestions with multi-provider fallback
- Recharts visualizations: line, area, bar, pie, radar, radial bar
- Date-range filtering, column selector, theme support
- Interactive chart builder with drag-to-resize grid

### Campaigns
- Group saved rows into named campaigns for outreach tracking
- Add/remove rows from campaigns

### Authentication
- Google OAuth via Better Auth
- Multi-session: up to 5 Google accounts per device
- Account switching without full logout
- Demo mode: full access without auth configuration

## Getting Started

### Prerequisites
- Node.js >= 22
- pnpm
- PostgreSQL (or Supabase project)
- Redis (Upstash or local)
- Google OAuth credentials (for production auth)
- Groq / CommandCode / Cloudflare API key (for AI processing)

### Environment Variables

Copy `.env.example` to `.env` in both `groweasy/` and `backend/`:

**Backend** (`backend/.env`):
```env
PORT=4000
DATABASE_URL=postgresql://...
FRONTEND_URL=http://localhost:3000
BETTER_AUTH_SECRET=<random-32-char>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# AI (optional — falls back to deterministic mode)
GROQ_API_KEY=...
COMMANDCODE_API_KEY=...
CLOUDFLARE_AI_API_KEY=...
CLOUDFLARE_AI_ACCOUNT_ID=...

# Cache (optional — falls back to in-memory)
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

**Frontend** (`groweasy/.env`):
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

### Install & Run

```bash
# Backend
cd backend
pnpm install
pnpm dev     # starts on :4000

# Frontend
cd groweasy
pnpm install
pnpm dev     # starts on :3000
```

### Database Setup

Run the schema SQL against your Supabase/PostgreSQL database:

```bash
psql $DATABASE_URL < groweasy/supabase/schema.sql
```

### Demo Mode

When `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, or `DATABASE_URL` are not configured, the app runs in demo mode with a local demo user and in-memory storage. AI features without an API key fall back to deterministic cleaning only.

## API Overview

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/*` | ALL | Better Auth endpoints (sign-in, sign-out, sessions) |
| `/api/auth/me` | GET | Current user session |
| `/api/auth/config` | GET | Auth + Redis + Groq status |
| `/api/templates` | GET/POST | List or create templates |
| `/api/templates/:id` | GET/PATCH/DELETE | CRUD individual template |
| `/api/imports` | GET/POST | List or create imports |
| `/api/imports/:id` | GET | Import details with results |
| `/api/imports/:id/results` | GET | Cleaned rows for an import |
| `/api/imports/:id/stream-process` | GET | SSE stream of AI batch progress |
| `/api/tables` | GET | List all saved rows |
| `/api/tables/:id/rows` | GET/POST | Query or add rows |
| `/api/tables/:id/rows/:rowId` | PATCH/DELETE | Update or delete a row |
| `/api/analytics/suggest-chart` | POST | AI chart suggestions |
| `/api/campaigns` | GET/POST | List or create campaigns |
| `/api/campaigns/:id/rows` | POST/DELETE | Add/remove campaign rows |
| `/api/google-sheets/export` | POST | Export rows to Google Sheets |
| `/api/history` | GET | List export/import history |

## Project Structure

### Frontend (`groweasy/`)

```
src/
├── app/                     # Next.js App Router pages
│   ├── dashboard/           # Dashboard with summary cards
│   ├── upload/[importId]/   # Upload wizard steps
│   │   ├── validate/        # Raw row preview + validation options
│   │   ├── preview/         # Sheet tabs + column mapping
│   │   ├── process/         # AI processing with SSE stream
│   │   ├── review/          # Editable review workspace
│   │   └── export/          # Excel + Google Sheets export
│   ├── templates/           # Template CRUD + row views
│   ├── campaigns/           # Campaign management
│   ├── analytics/           # AI chart builder
│   ├── history/             # Export history
│   └── login/               # Google OAuth login
├── components/
│   ├── ui/                  # shadcn/ui primitives (button, dialog, input, etc.)
│   ├── data-grid.tsx        # Review table with editable cells
│   ├── virtual-table.tsx    # Virtualized row browser
│   ├── chart-variants.tsx   # Interactive chart grid
│   ├── template-form.tsx    # Template creation/editing form
│   ├── account-switcher.tsx # Multi-session Google account management
│   └── ...
├── lib/
│   ├── api-client.ts        # Client-side API fetch wrapper
│   ├── server-api.ts        # Server-side API fetch with cookie forwarding
│   ├── formatting.ts        # Deterministic cleaning rules
│   ├── types.ts             # Shared TypeScript types
│   └── ...
```

### Backend (`backend/`)

```
src/
├── routes/
│   ├── auth.ts              # Auth endpoints (Better Auth handler)
│   ├── templates.ts         # Template CRUD
│   ├── imports.ts           # Import creation, processing, results
│   ├── analytics.ts         # Chart suggestions
│   ├── campaigns.ts         # Campaign management
│   ├── google-sheets.ts     # Google Sheets integration
│   ├── tables.ts            # Saved row operations
│   └── history.ts           # History logs
├── server/
│   ├── ai/
│   │   ├── excel-cleaner.ts # Deterministic + AI hybrid cleaning
│   │   ├── ai-client.ts     # Multi-provider AI client (Groq/CommandCode/Cloudflare)
│   │   └── prompts/         # Versioned AI prompts
│   ├── repositories/
│   │   └── store.ts         # In-memory store with Redis + Supabase sync
│   ├── workbooks/
│   │   └── parser.ts        # Excel/CSV file parsing
│   └── auth/
│       └── auth.ts          # Better Auth configuration
└── lib/
    ├── schemas.ts           # Zod validation schemas
    ├── types.ts             # Shared TypeScript types
    ├── formatting.ts        # Column formatting rules
    └── data/
        └── sample-data.ts   # Demo template + data
```

## AI Pipeline

See [MODEL.md](./MODEL.md) for detailed documentation of the AI processing architecture, provider configuration, prompt design, and decision logic.
