# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PIA (Personal Information Aggregator) is a web app that consolidates information from multiple sources (Slack, Gmail, LinkedIn, Twitter, browser extension, manual links) into a single modern interface. An agentic backend will retrieve, summarize, deduplicate, and prioritize content.

**Current state:** Next.js frontend + SQLite backend with REST API. Browser extension saves directly to the API. Mock data auto-seeds the DB on first run.

## Tech Stack

- **Next.js 16** (App Router) with TypeScript
- **Tailwind CSS v4** + **shadcn/ui** for components
- **lucide-react** for icons
- **better-sqlite3** for local SQLite database
- **Jest** + **React Testing Library** for tests
- **Prettier** + **ESLint** for formatting and linting
- **Chrome Extension** (Manifest V3) in `browser-extension/`

## Quick Start (new developer setup)

```bash
# 1. Install dependencies
npm install

# 2. Copy the example env file and configure if needed
cp .env.example .env.local
# (The defaults work for local development — no changes needed)

# 3. Start the dev server
npm run dev
# → Opens at http://localhost:3000
# → SQLite database is created at data/pia.db on first run
# → 15 mock items are auto-seeded if the DB is empty
```

## Commands

```bash
npm run dev           # Start dev server at localhost:3000
npm run build         # Production build (TypeScript checks included)
npm run start         # Start production server
npm run lint          # ESLint + Prettier check
npm run format        # Auto-format all files with Prettier
npm run format:check  # Check formatting without writing
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

## Environment Variables

All config is driven by environment variables. Copy `.env.example` to `.env.local` to configure locally.

| Variable                   | Default                 | Purpose                            |
| -------------------------- | ----------------------- | ---------------------------------- |
| `DB_PATH`                  | `./data/pia.db`         | Path to the SQLite database file   |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3000` | Base URL for client-side API calls |
| `GEMINI_API_KEY`           | *(none)*                | Google Gemini API key for summarization, prioritization, research |

**Security rules:**

- Never commit `.env.local` (it is gitignored)
- Never commit `data/pia.db` (personal data — gitignored)
- `.env.example` must only contain placeholder values, never real secrets

## Architecture

### Web App (`src/`)

- `src/app/` — Next.js App Router pages (Dashboard, Feed, Topics, Sources, Settings)
- `src/app/api/items/` — REST API: GET/POST `/api/items`, PATCH/DELETE `/api/items/[id]`
- `src/components/` — Organized by feature: `layout/`, `dashboard/`, `feed/`, `topics/`, `sources/`, `ui/`
- `src/lib/config.ts` — Central config module (all env vars exported from here)
- `src/lib/db.ts` — SQLite singleton, schema init, seed, CRUD helpers (server-only)
- `src/lib/og.ts` — Open Graph metadata fetcher (server-only)
- `src/lib/types.ts` — Core TypeScript interfaces (`ContentItem`, `Topic`, `Source`, `AgentSettings`)
- `src/lib/mock-data.ts` — Mock data used for DB seeding on first run
- `src/lib/utils.ts` — shadcn utility (cn function)
- `src/lib/ai/` — AI agent modules (server-only):
  - `client.ts` — Google Gemini SDK singleton (`generateText`, `generateTextWithSearch`)
  - `summarize.ts` — Content summarization with Gemini
  - `prioritize.ts` — Hybrid heuristic + AI feed scoring
  - `research.ts` — Deep research with Google Search grounding
  - `preferences.ts` — Preference learning from feedback
  - `prompts.ts` — All prompt templates
  - `types.ts` — AI-specific TypeScript interfaces

### AI Agent System

The AI agent system uses Google Gemini (`gemini-2.5-flash`) for:
1. **Summarization** — generates markdown summaries for content items (brief/detailed modes)
2. **Feedback & Learning** — tracks user like/dislike with reasons, builds preference profile
3. **Prioritization** — scores items using learned preferences (heuristic + optional AI ranking)
4. **Deep Research** — multi-step research with live web search, produces cited markdown reports

API routes: `POST /api/ai/summarize`, `GET /api/ai/summary/[itemId]`, `POST /api/ai/feedback`, `GET /api/ai/feedback/[itemId]`, `POST /api/ai/prioritize`, `GET/PUT /api/ai/preferences`, `POST /api/ai/research`, `GET /api/ai/research/[id]`

Additional DB tables: `ai_summaries`, `feedback`, `research_reports`, `user_settings`

### Data Flow

- **Server Components** (Dashboard page, Feed detail page): call `getItems()` / `getItemById()` from `db.ts` directly — no HTTP
- **Client Components** (Feed list, Topics, Sources): fetch from `/api/items` via the `config.apiBaseUrl`
- **Browser Extension**: POSTs to `http://localhost:3000/api/items` (or `PIA_API_URL` in extension config)

### Database

SQLite file at `data/pia.db` (gitignored). Tables:

- `items` — content items matching `ContentItem` type (+ `ai_priority_score` column)
- `ai_summaries` — AI-generated markdown summaries (one per item)
- `feedback` — user like/dislike with optional reason
- `research_reports` — deep research outputs with status tracking
- `user_settings` — key-value store for agent config and learned preferences
- `oauth_tokens` — OAuth credentials for source connectors

Notes:
- `topics` stored as JSON string, deserialized on read
- `isRead` stored as 0/1 integer, converted to boolean on read
- WAL mode enabled for concurrent read performance
- Seeded with 13 mock items on first run (if table is empty)

### Layout

All pages share a root layout with a collapsible sidebar (`components/layout/sidebar.tsx`) and top bar with search (`components/layout/topbar.tsx`).

### Content Model

Everything revolves around `ContentItem` which has: source type, content type (article/video/podcast), topics array, priority level, and read state.

### Browser Extension (`browser-extension/`)

Chrome MV3 extension. On save: POSTs to the PIA API. Falls back to `chrome.storage.local` if the API is unreachable (items flagged `pendingSync: true` for future sync).

## Testing

Tests live in `__tests__/` directories next to the files they test.

```
src/lib/__tests__/og.test.ts           # OG fetcher unit tests
src/lib/__tests__/db.test.ts           # DB CRUD unit tests
src/app/api/items/__tests__/route.test.ts         # GET/POST API tests
src/app/api/items/[id]/__tests__/route.test.ts    # PATCH/DELETE API tests
src/components/dashboard/__tests__/              # Dashboard component tests
```

- DB tests use `DB_PATH=":memory:"` for isolation — never touch real `data/pia.db`
- Component tests use `@jest-environment jsdom` docblock
- Run `npm test` before committing changes to verify no regressions

## Conventions

- shadcn/ui components live in `src/components/ui/` — add via `npx shadcn@latest add <component>`
- Source icons and colors are mapped via `Record<SourceType, ...>` objects in components that need them
- `db.ts` is server-only — never import it from `"use client"` components
- Client components use `config.apiBaseUrl` (from `src/lib/config.ts`) for API calls
- Time formatting uses local `timeAgo()` helper functions (not yet extracted to shared util)
- Dashboard and detail pages are Server Components (no `"use client"`)
- Feed list, Topics, Sources pages are Client Components (interactive filters / fetch on mount)
- `src/lib/ai/` modules are server-only — never import from `"use client"` components
- AI-generated content is rendered as markdown using `react-markdown` + `remark-gfm`
- AI prompts are centralized in `src/lib/ai/prompts.ts` for easy iteration

## Deployment

To deploy PIA to a cloud provider (Railway, Render, Fly.io, etc.):

1. **Set environment variables** in your deployment dashboard:
   - `DB_PATH` → path on a **persistent volume** (e.g. `/mnt/data/pia.db`). Without a persistent volume, the DB will be wiped on each deploy.
   - `NEXT_PUBLIC_API_BASE_URL` → your deployed URL (e.g. `https://pia.yourdomain.com`)

2. **Build command:** `npm run build`
3. **Start command:** `npm run start`

4. **Browser extension:** update `PIA_API_URL` in `browser-extension/background.js` and `browser-extension/popup.js` to point to the deployed URL.

## Iterative Build Roadmap

1. ✅ Frontend shell with mock data
2. ✅ SQLite backend + API routes + browser extension connector
3. ✅ Source connectors (Gmail newsletters via OAuth2)
4. ✅ AI agent integration (Gemini API) — summarization, feedback, prioritization, deep research
5. ⬜ Video/podcast transcription + summarization
6. ⬜ Additional source connectors (Slack, RSS, etc.)
