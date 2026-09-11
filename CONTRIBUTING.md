# Contributing to Distil

This is a short guide to get you from zero to pull request. For the full picture — system
architecture, session protocol, authorization boundaries — read [AGENTS.md](AGENTS.md); this file
is a summary, not a replacement.

## Setup

```bash
git clone https://github.com/amitsharmaak/distil.git
cd distil
npm install
# Create .env.local with DATABASE_URL, DATABASE_MIGRATION_URL, DISTIL_SESSION_SECRET,
# DISTIL_ALLOWED_ORIGINS, NEXT_PUBLIC_API_BASE_URL, and an AI provider key (see scripts/setup.sh)
npm run db:migrate
npm run db:tenant:migrate
npm run dev
```

See [README.md](README.md) for details.

## Branches and PRs

- Branch from current `main`, named `<agent>/<task>` (e.g. `claude/...`, `codex/...`) for coding
  agents, or `feat/your-feature` / `fix/your-bug` for humans.
- `main` is protected: PRs require the `quality-gate` CI check to pass, resolved conversations,
  and linear history.
- Run the suites that cover what you touched, plus `npm run typecheck` and `npm run lint`, before
  opening a PR.

## Test naming conventions

Naming decides which runner picks up a test file:

- `*.unit.test.ts(x)`
- `*.component.test.tsx` (jsdom docblock)
- `*.contract.test.ts`
- `*.security.unit.test.ts`
- `*.integration.test.ts` (PostgreSQL, via Testcontainers or `DISTIL_TEST_POSTGRES_URL`)
- `*.sqlite-integration.test.ts` (legacy compatibility)
- `*.live.test.ts` (opt-in only, contacts real providers)

Shared fixtures live in `tests/support/`, the Phase 3 two-tenant harness in `tests/harness/`,
security specs in `tests/security/`, Playwright suites in `tests/e2e/` and `tests/extension/`. See
`tests/README.md`.

## Code conventions

- Server-only modules (`src/lib/ai/`, `intelligence/`, `agent/`, `knowledge/`, `postgres/`,
  `capture/`, `auth/`, `database.ts`, `db.ts`) are never imported from `"use client"` components.
- Read environment variables only through `src/lib/config.ts` and the flag module; never
  `process.env` elsewhere.
- Client components call the API through `config.apiBaseUrl`; new clients use `/api/v1/*`.
- Every new route, worker, query or AI context path must take a verified `AuthContext` and be
  added to `docs/authorization-matrix.json` with matching adversarial tests.
- Logs must not contain credentials, cookies, URLs with tokens, prompts, content or raw error
  text (`src/lib/logger.ts` conventions).
- AI-generated markdown renders through `react-markdown` + `remark-gfm`; sanitize HTML with
  `content-sanitizer.ts`.
- shadcn/ui primitives go in `src/components/ui/` via `npx shadcn@latest add <component>`.
- Prettier (`printWidth` 100) and ESLint are enforced on changed files; the lint baseline is 10
  known warnings and zero errors.

## Full guide

Read [AGENTS.md](AGENTS.md) for the complete architecture, session protocol, and authorization
rules before making non-trivial changes.
