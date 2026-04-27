# Contributing to Distil

Thanks for your interest in contributing! This document covers everything you need to go from zero to pull request.

## Quick Start

```bash
git clone https://github.com/amitsharmaak/distil.git
cd distil
npm install
cp .env.example .env.local
# Edit .env.local — set at least GEMINI_API_KEY (or another AI provider key)
npm run dev
```

The app starts at `http://localhost:3000`. The SQLite database is created automatically on first run — no migrations needed.

## Project Structure

```
src/
├── app/           # Next.js pages and API routes
├── components/    # React components, organized by feature
└── lib/           # The intelligence core (server-only)
    ├── ai/        # AI providers, routing, summarization, research
    ├── intelligence/ # Unified 5-stage ingestion pipeline
    ├── agent/     # Conversational agent and RAG
    ├── connectors/ # Gmail, Slack, authenticated publishers
    ├── middleware/ # Auth, rate-limiting, CORS, tracing
    └── db.ts      # SQLite singleton and all CRUD helpers
browser-extension/ # Chrome MV3 extension
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a deeper walkthrough of non-obvious design decisions.

## Development Workflow

1. **Fork and branch** — branch from `main` using `feat/your-feature` or `fix/your-bug`
2. **Make changes** — follow the conventions below
3. **Run tests** — `npm test` must pass before you submit
4. **Lint and format** — `npm run lint && npm run format`
5. **Open a PR** — describe what changed and why; include a test plan

## Running Tests

```bash
npm test              # all tests
npm run test:watch    # watch mode during development
npm run test:coverage # coverage report
```

Tests use in-memory SQLite (`DB_PATH=":memory:"`) — they never touch your local `data/distil.db`. No API keys are needed to run the test suite.

## Code Conventions

- **Server-only modules** — `src/lib/ai/`, `src/lib/intelligence/`, `src/lib/agent/`, and `src/lib/db.ts` are server-only. Never import them from `"use client"` components.
- **API base URL** — client components fetch via `config.apiBaseUrl` from `src/lib/config.ts`, not hardcoded strings.
- **UI components** — add shadcn/ui primitives with `npx shadcn@latest add <component>`; they go in `src/components/ui/`.
- **AI prompts** — all prompt templates live in `src/lib/prompts/` (split by domain). `index.ts` re-exports everything.
- **Environment variables** — all env vars are exported from `src/lib/config.ts`. Never read `process.env` directly outside that file.
- **Comments** — only add a comment when the *why* is non-obvious. Well-named identifiers are preferred over explanatory comments.

## How to Add a New AI Provider

1. Implement the `AIProvider` interface in `src/lib/ai/providers.ts`
2. Add your provider's model names to `src/lib/ai/ai-config.ts` (`DEFAULT_MODEL_CONFIG`, `PROVIDER_FALLBACK_MODELS`, `MODEL_COSTS`)
3. Register it in `createProviders()` in `providers.ts` — the router picks it up automatically
4. Add the API key env var to `.env.example` and `src/lib/config.ts`

## How to Add a New Source Connector

Connectors live in `src/lib/connectors/`. A connector is responsible for fetching raw content and handing it to `processContent()` from `src/lib/intelligence/pipeline.ts`. The pipeline handles classification, relevance gating, extraction, analysis, and enrichment — the connector just needs to provide a URL or raw body.

Look at `src/lib/connectors/slack.ts` for a simple reference implementation.

## How to Add a New Authenticated Publisher

Publishers (paywalled sites like The Ken) use Playwright with a persisted login session. Adding a publisher is one file + one registry line:

1. Create `src/lib/connectors/publishers/publishers/<id>.ts` implementing `PublisherDefinition`
2. Add it to `ALL_PUBLISHERS` in `src/lib/connectors/publishers/registry.ts`

See `docs/authenticated-publisher-framework.md` for full details.

## Commit Style

Use conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`. Keep the subject line under 72 characters. Explain *why* in the body if the change isn't obvious from the diff.

## Questions?

Open an issue — happy to help.
