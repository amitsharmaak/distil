# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Distil is a web app that consolidates information from multiple sources (Slack, Gmail, Twitter, browser extension, manual links) into a single modern interface. An agentic backend will retrieve, summarize, deduplicate, and prioritize content.

**Current state:** Next.js frontend + SQLite backend with REST API. Browser extension saves directly to the API. The database starts empty; content is added via connectors (Gmail, Slack) and manual links.

## Context Management

When working in this codebase:

- **Use subagents for exploration** — launch an Explore subagent for any task that
  requires searching across files, finding patterns, or understanding unfamiliar
  modules. Do not read multiple files serially in the main conversation thread.

- **Delegate research & multi-file analysis** — when a task touches more than 3
  files or requires understanding how subsystems connect (e.g., the AI pipeline,
  connector architecture, database schema), delegate to a subagent rather than
  loading all files into the main context.

- **Return only summarized insights** — subagents should return structured
  summaries (key functions, relevant patterns, architectural decisions), not raw
  file contents. The main context receives the digest, not the source material.

These rules keep the main context window lean on a growing codebase and ensure
multi-step tasks stay within token budgets.

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
# → SQLite database is created at data/distil.db on first run (starts empty)
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

| Variable                   | Default                 | Purpose                                      |
| -------------------------- | ----------------------- | -------------------------------------------- |
| `DB_PATH`                  | `./data/distil.db`         | Path to the SQLite database file             |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3000` | Base URL for client-side API calls           |
| `GEMINI_API_KEY`           | *(none)*                | Google Gemini API key for AI features        |
| `SLACK_CLIENT_ID`          | *(none)*                | Slack App Client ID (User OAuth flow)        |
| `SLACK_CLIENT_SECRET`      | *(none)*                | Slack App Client Secret                      |
| `SLACK_REDIRECT_URI`       | `http://localhost:3000/api/auth/slack/callback` | Must match a Redirect URL on the Slack App |
| `SLACK_SYNC_CHANNELS` | *(empty — syncs nothing)* | Comma-separated channel names/IDs to sync; required to sync anything |
| `GMAIL_NEWSLETTER_SENDERS` | *(empty)*               | Reserved for future use; Gmail sync auto-detects newsletters |
| `GMAIL_SYNC_AFTER_DATE`    | 30 days ago             | Earliest date to sync emails (YYYY/MM/DD)    |

**Security rules:**

- Never commit `.env.local` (it is gitignored)
- Never commit `data/distil.db` (personal data — gitignored)
- `.env.example` must only contain placeholder values, never real secrets

## Architecture

### Web App (`src/`)

- `src/middleware.ts` — Root Next.js middleware
- `src/app/` — Next.js App Router pages (Dashboard, Feed, Research, Topics, Sources, Settings)
- `src/app/api/items/` — REST API: GET/POST `/api/items`, PATCH/DELETE `/api/items/[id]`, POST `/api/items/[id]/extract`
- `src/app/api/agent/` — Agentic backend routes: `/api/agent/chat`, `/api/agent/status`, `/api/agent/approvals`
- `src/app/api/notifications/` — Notification routes (list, read, preferences)
- `src/app/api/settings/` — Settings routes (e.g. email intelligence config)
- `src/components/` — Organized by feature: `layout/`, `dashboard/`, `feed/`, `agent/`, `brief/`, `notifications/`, `topics/`, `sources/`, `ui/`
- `src/lib/config.ts` — Central config module (all env vars exported from here)
- `src/lib/db.ts` — SQLite singleton, schema init, seed, CRUD helpers (server-only)
- `src/lib/og.ts` — Open Graph metadata fetcher (server-only)
- `src/lib/types.ts` — Core TypeScript interfaces (`ContentItem`, `Topic`, `Source`, `AgentSettings`)
- `src/lib/utils.ts` — shadcn utility (cn function)
- `src/lib/constants.ts` — Shared constants
- `src/lib/format.ts` — Formatting helpers
- `src/lib/logger.ts` — Logging utility
- `src/lib/notifications.ts` — Notification helpers
- `src/lib/pii-filter.ts` — PII scrubbing before AI processing
- `src/lib/content-extractor.ts` — Article/content extraction
- `src/lib/content-strategies/` — Per-content-type extraction strategies (article, tweet, youtube)
- `src/lib/ai/` — AI modules (server-only):
  - `client.ts` — Google Gemini SDK singleton (`generateText`, `generateTextWithSearch`)
  - `summarize.ts` — Content summarization with Gemini
  - `prioritize.ts` — Hybrid heuristic + AI feed scoring
  - `research.ts` — Deep research with Google Search grounding
  - `preferences.ts` — Preference learning from feedback
  - `tagger.ts` — Auto-tagging / topic classification
  - `embeddings.ts` — Vector embeddings for semantic search
  - `search.ts` — Semantic search over content
  - `router.ts` — AI request routing / model selection
  - `providers.ts` — AI provider abstraction
  - `ai-config.ts` — AI configuration
  - `circuit-breaker.ts` — Circuit breaker for AI calls
  - `retry.ts` — Retry logic for AI calls
  - `types.ts` — AI-specific TypeScript interfaces
- `src/lib/prompts/` — All prompt templates (split by domain):
  - `index.ts` — Re-exports all prompts
  - `intelligence.ts` — Intelligence/analysis prompts
  - `prioritize.ts` — Prioritization prompts
  - `research.ts` — Deep research prompts
  - `summarize.ts` — Summarization prompts
- `src/lib/intelligence/` — Content intelligence pipeline (server-only):
  - `pipeline.ts` — Orchestrates enrichment steps
  - `analyzer.ts` — Content analysis
  - `classifier.ts` — Topic/category classification
  - `enricher.ts` — Metadata enrichment
  - `extractor.ts` — Entity/keyword extraction
  - `relevance.ts` — Relevance scoring
  - `types.ts` — Intelligence-specific types
- `src/lib/agent/` — Agentic orchestration (server-only):
  - `orchestrator.ts` — Main agent loop
  - `job-worker.ts` — Background job processing
  - `tool-registry.ts` — Agent tool definitions
  - `register-tools.ts` — Tool registration
  - `rag.ts` — Retrieval-augmented generation
  - `insight-detection.ts` — Proactive insight surfacing
  - `proactive-research.ts` — Autonomous research triggers
  - `db-adapter.ts` — DB adapter for agent persistence
  - `workflows/triage.ts` — Triage workflow
- `src/lib/middleware/` — Composable API middleware (auth, cors, rate-limit, trace)

### AI Agent System

The AI agent system uses Google Gemini (`gemini-2.5-flash`) for:
1. **Summarization** — generates markdown summaries for content items (brief/detailed modes)
2. **Feedback & Learning** — tracks user like/dislike with reasons, builds preference profile
3. **Prioritization** — scores items using learned preferences (heuristic + optional AI ranking)
4. **Deep Research** — multi-step research with live web search, produces cited markdown reports

API routes: `POST /api/ai/summarize`, `GET /api/ai/summary/[itemId]`, `POST /api/ai/feedback`, `GET /api/ai/feedback/[itemId]`, `POST /api/ai/prioritize`, `GET/PUT /api/ai/preferences`, `POST /api/ai/research`, `GET /api/ai/research/[id]`, `GET /api/ai/research/[id]/stream`, `GET /api/ai/research/list`, `POST /api/ai/research/proactive` (suggestions only), `GET /api/ai/research/suggestions`, `DELETE /api/ai/research/suggestions/[id]`, `POST /api/ai/research/suggestions/[id]/start`

Agent routes: `POST /api/agent/chat`, `GET /api/agent/status`, `POST /api/agent/approvals`

Additional DB tables: `ai_summaries`, `feedback`, `research_reports`, `research_suggestions`, `user_settings`

### Data Flow

- **Server Components** (Dashboard page, Feed detail page): call `getItems()` / `getItemById()` from `db.ts` directly — no HTTP
- **Client Components** (Feed list, Topics, Sources): fetch from `/api/items` via the `config.apiBaseUrl`
- **Browser Extension**: POSTs to `http://localhost:3000/api/items` (or `DISTIL_API_URL` in extension config)
- **Slack Connector**: `POST /api/slack/sync` calls `syncSlackMessages()` which fetches channel messages via Slack Web API

### Database

SQLite file at `data/distil.db` (gitignored). Tables:

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
- Database starts empty; no mock data seeding

### Layout

All pages share a root layout with a collapsible sidebar (`components/layout/sidebar.tsx`) and top bar with search (`components/layout/topbar.tsx`).

### Content Model

Everything revolves around `ContentItem` which has: source type, content type (article/video/podcast), topics array, priority level, and read state.

### Browser Extension (`browser-extension/`)

Chrome MV3 extension. On save: POSTs to the Distil API. Falls back to `chrome.storage.local` if the API is unreachable (items flagged `pendingSync: true` for future sync).

### Slack Integration

- **User OAuth** (xoxp tokens) — the app acts AS the connected user, so it can read every public channel, private channel, DM and group DM the user is a member of. No per-channel bot invitations required.
- **Channel allowlist** — set `SLACK_SYNC_CHANNELS` (comma-separated names/IDs, e.g. `general,engineering`) to restrict which channels are synced. If unset or empty, sync is skipped entirely. The `NEXT_PUBLIC_` prefix makes it available to both server and client so the Sources page can display the active list without a separate variable.
- Connect from the Sources page → `GET /api/auth/slack` → Slack consent → `GET /api/auth/slack/callback` exchanges the code via `oauth.v2.access` and stores the user token in `oauth_tokens` (provider="slack").
- Sync: `POST /api/slack/sync` enumerates conversations via `users.conversations`, applies the `SLACK_CHANNELS` allowlist, and pulls history with `conversations.history`.
- Core logic: `src/lib/connectors/slack.ts`. OAuth routes: `src/app/api/auth/slack/{route,callback,status}.ts`.
- Required Slack App User Token Scopes: `channels:history`, `channels:read`, `groups:history`, `groups:read`, `im:history`, `im:read`, `mpim:history`, `mpim:read`, `users:read`.
- Requires `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and `SLACK_SYNC_CHANNELS` in `.env.local`.

### Authenticated Publisher Framework

A registry-driven framework for paywalled publications (The Ken first; Stratechery, FT, etc. next). Adding a publisher = one file + one registry line — no new code paths or routes.

- **Add a publisher**: drop a `PublisherDefinition` file in `src/lib/connectors/publishers/publishers/<id>.ts` and append it to `ALL_PUBLISHERS` in `src/lib/connectors/publishers/registry.ts`. Defines `urlMatcher`, `loginUrl`, `sessionProbe`, and `discovery` strategies (`gmail-sender` / `rss` / `logged-in-feed`).
- **Hook**: `src/lib/intelligence/extractor.ts` checks `findByUrl(url)` first — any matching URL routes through `fetchArticle(publisher, url)` (Playwright + persisted session + Readability) instead of the public HTTP extractor. This means manual `/api/items` POSTs, browser-extension saves, and Gmail-discovered URLs all use the authenticated fetcher automatically.
- **Sessions**: persisted Playwright contexts in `data/publisher-sessions/<id>/` (gitignored). Login is interactive — `runInteractiveLogin` opens a non-headless Chromium window so the user completes Google SSO themselves. **Local-only constraint**: this only works when the Next.js server runs on the user's machine; cloud deployment needs a different model.
- **Queue**: shared `publisher_queue` table (`publisher_id`, `url`, `status`, `attempts`, `last_error`) for batch discovery (Gmail digests, logged-in crawls). Manual ingestion bypasses the queue.
- **Worker / scheduler**: `syncAllPublishers()` in `src/lib/connectors/publishers/worker.ts`; auto-sync branch in `src/lib/sync-scheduler.ts`. Per-publisher mutex enforces `fetchConcurrency` and `minDelayMs`. `PublisherAuthRequired` propagates from `extractor → pipeline → worker` so the user sees a "Reconnect" prompt.
- **API**: `GET /api/publishers`, `POST /api/publishers/[id]/login`, `GET /api/publishers/[id]/status`, `POST /api/publishers/[id]/sync`. Sources page renders one `PublisherCard` per registry entry.

## Testing

Tests live in `__tests__/` directories next to the files they test.

```
src/lib/__tests__/og.test.ts           # OG fetcher unit tests
src/lib/__tests__/db.test.ts           # DB CRUD unit tests
src/app/api/items/__tests__/route.test.ts         # GET/POST API tests
src/app/api/items/[id]/__tests__/route.test.ts    # PATCH/DELETE API tests
src/components/dashboard/__tests__/              # Dashboard component tests
```

- DB tests use `DB_PATH=":memory:"` for isolation — never touch real `data/distil.db`
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
- `src/lib/ai/` and `src/lib/intelligence/` and `src/lib/agent/` modules are server-only — never import from `"use client"` components
- AI-generated content is rendered as markdown using `react-markdown` + `remark-gfm`
- AI prompts are centralized in `src/lib/prompts/` (split by domain) — `index.ts` re-exports all

## Deployment

To deploy Distil to a cloud provider (Railway, Render, Fly.io, etc.):

1. **Set environment variables** in your deployment dashboard:
   - `DB_PATH` → path on a **persistent volume** (e.g. `/mnt/data/distil.db`). Without a persistent volume, the DB will be wiped on each deploy.
   - `NEXT_PUBLIC_API_BASE_URL` → your deployed URL (e.g. `https://distil.yourdomain.com`)

2. **Build command:** `npm run build`
3. **Start command:** `npm run start`

4. **Browser extension:** update `DISTIL_API_URL` in `browser-extension/background.js` and `browser-extension/popup.js` to point to the deployed URL.

## Iterative Build Roadmap

1. ✅ Frontend shell with mock data
2. ✅ SQLite backend + API routes + browser extension connector
3. ✅ Source connectors (Gmail newsletters via OAuth2)
4. ✅ AI agent integration (Gemini API) — summarization, feedback, prioritization, deep research
5. ⬜ Video/podcast transcription + summarization
6. 🔄 Additional source connectors (✅ Slack, ⬜ RSS, etc.)

## Directory Structure

```
distil/
├── .claude/
│   ├── settings.json
│   └── settings.local.json
├── .env.example
├── .gitignore
├── .prettierignore
├── .prettierrc
├── CLAUDE.md
├── README.md
├── browser-extension/
│   ├── background.js
│   ├── icons/
│   │   ├── icon16.png
│   │   ├── icon48.png
│   │   └── icon128.png
│   ├── manifest.json
│   ├── popup.css
│   ├── popup.html
│   └── popup.js
├── components.json
├── eslint.config.mjs
├── jest.config.ts
├── jest.setup.ts
├── next-env.d.ts
├── next.config.ts
├── package.json
├── package-lock.json
├── postcss.config.mjs
├── public/
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── src/
│   ├── middleware.ts
│   ├── app/
│   │   ├── api/
│   │   │   ├── agent/
│   │   │   │   ├── approvals/route.ts
│   │   │   │   ├── chat/route.ts
│   │   │   │   └── status/route.ts
│   │   │   ├── ai/
│   │   │   │   ├── feedback/
│   │   │   │   │   ├── [itemId]/route.ts
│   │   │   │   │   └── route.ts
│   │   │   │   ├── preferences/route.ts
│   │   │   │   ├── prioritize/route.ts
│   │   │   │   ├── research/
│   │   │   │   │   ├── [id]/
│   │   │   │   │   │   ├── route.ts
│   │   │   │   │   │   └── stream/route.ts
│   │   │   │   │   ├── list/route.ts
│   │   │   │   │   └── route.ts
│   │   │   │   ├── summarize/route.ts
│   │   │   │   └── summary/[itemId]/route.ts
│   │   │   ├── auth/gmail/
│   │   │   │   ├── callback/route.ts
│   │   │   │   ├── route.ts
│   │   │   │   └── status/route.ts
│   │   │   ├── gmail/sync/route.ts
│   │   │   ├── items/
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── __tests__/route.test.ts
│   │   │   │   │   ├── extract/route.ts
│   │   │   │   │   └── route.ts
│   │   │   │   ├── __tests__/route.test.ts
│   │   │   │   ├── rejected/route.ts
│   │   │   │   └── route.ts
│   │   │   ├── notifications/
│   │   │   │   ├── [id]/route.ts
│   │   │   │   ├── preferences/route.ts
│   │   │   │   └── route.ts
│   │   │   ├── settings/
│   │   │   │   └── email-intelligence/route.ts
│   │   │   └── slack/
│   │   │       ├── status/route.ts
│   │   │       └── sync/route.ts
│   │   ├── feed/
│   │   │   ├── [id]/page.tsx
│   │   │   └── page.tsx
│   │   ├── research/
│   │   │   ├── [id]/page.tsx
│   │   │   └── page.tsx
│   │   ├── settings/page.tsx
│   │   ├── sources/page.tsx
│   │   ├── topics/page.tsx
│   │   ├── favicon.ico
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── agent/
│   │   │   ├── agent-status-panel.tsx
│   │   │   └── chat-panel.tsx
│   │   ├── brief/
│   │   │   └── insight-card.tsx
│   │   ├── dashboard/
│   │   │   ├── __tests__/
│   │   │   │   ├── priority-feed.test.tsx
│   │   │   │   └── stats-overview.test.tsx
│   │   │   ├── activity-timeline.tsx
│   │   │   ├── priority-feed.tsx
│   │   │   └── stats-overview.tsx
│   │   ├── feed/
│   │   │   ├── ai-summary.tsx
│   │   │   ├── article-navigation.tsx
│   │   │   ├── content-card.tsx
│   │   │   ├── deep-research.tsx
│   │   │   ├── detail-action-bar.tsx
│   │   │   ├── feed-filters.tsx
│   │   │   ├── feedback-buttons.tsx
│   │   │   ├── lazy-article-extract.tsx
│   │   │   ├── mark-read-button.tsx
│   │   │   ├── reader-view.tsx
│   │   │   └── video-embed.tsx
│   │   ├── layout/
│   │   │   ├── mobile-nav.tsx
│   │   │   ├── sidebar.tsx
│   │   │   ├── theme-provider.tsx
│   │   │   ├── theme-toggle.tsx
│   │   │   └── topbar.tsx
│   │   ├── notifications/
│   │   │   └── notification-panel.tsx
│   │   ├── sources/          (empty — sources page is self-contained)
│   │   ├── topics/           (empty — topics page is self-contained)
│   │   └── ui/
│   │       ├── avatar.tsx
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── dialog.tsx
│   │       ├── dropdown-menu.tsx
│   │       ├── input.tsx
│   │       ├── popover.tsx
│   │       ├── scroll-area.tsx
│   │       ├── select.tsx
│   │       ├── separator.tsx
│   │       ├── sheet.tsx
│   │       ├── skeleton.tsx
│   │       ├── tabs.tsx
│   │       ├── textarea.tsx
│   │       └── tooltip.tsx
│   └── lib/
│       ├── __tests__/
│       │   ├── db.test.ts
│       │   └── og.test.ts
│       ├── agent/
│       │   ├── db-adapter.ts
│       │   ├── insight-detection.ts
│       │   ├── job-worker.ts
│       │   ├── orchestrator.ts
│       │   ├── proactive-research.ts
│       │   ├── rag.ts
│       │   ├── register-tools.ts
│       │   ├── tool-registry.ts
│       │   └── workflows/
│       │       └── triage.ts
│       ├── ai/
│       │   ├── __tests__/
│       │   │   ├── prioritize.test.ts
│       │   │   ├── prompts.test.ts
│       │   │   └── summarize.test.ts
│       │   ├── ai-config.ts
│       │   ├── circuit-breaker.ts
│       │   ├── client.ts
│       │   ├── embeddings.ts
│       │   ├── preferences.ts
│       │   ├── prioritize.ts
│       │   ├── providers.ts
│       │   ├── research.ts
│       │   ├── retry.ts
│       │   ├── router.ts
│       │   ├── search.ts
│       │   ├── summarize.ts
│       │   ├── tagger.ts
│       │   └── types.ts
│       ├── connectors/
│       │   ├── gmail.ts
│       │   └── slack.ts
│       ├── content-strategies/
│       │   ├── article.ts
│       │   ├── index.ts
│       │   ├── tweet.ts
│       │   ├── types.ts
│       │   └── youtube.ts
│       ├── intelligence/
│       │   ├── analyzer.ts
│       │   ├── classifier.ts
│       │   ├── enricher.ts
│       │   ├── extractor.ts
│       │   ├── pipeline.ts
│       │   ├── relevance.ts
│       │   └── types.ts
│       ├── middleware/
│       │   ├── auth.ts
│       │   ├── cors.ts
│       │   ├── index.ts
│       │   ├── rate-limit.ts
│       │   └── trace.ts
│       ├── prompts/
│       │   ├── index.ts
│       │   ├── intelligence.ts
│       │   ├── prioritize.ts
│       │   ├── research.ts
│       │   └── summarize.ts
│       ├── config.ts
│       ├── constants.ts
│       ├── content-extractor.ts
│       ├── db.ts
│       ├── format.ts
│       ├── logger.ts
│       ├── notifications.ts
│       ├── og.ts
│       ├── pii-filter.ts
│       ├── types.ts
│       └── utils.ts
└── tsconfig.json
```
