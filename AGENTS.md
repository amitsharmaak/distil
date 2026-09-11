# AGENTS.md — shared working guidance for Distil

This file is the shared entry point for every coding agent (Claude Code, Codex) and for Amit. It
describes what Distil is, how the current system is built, how to verify work, and how agents
coordinate. It records no progress: **`docs/project-state.md` is the only place that tracks status,
decisions, evidence and next steps.** Read that file at the start of every session and update it
before every handoff.

## 1. What Distil is

Distil is Amit's personal knowledge-consumption app, initially single-user and later opened to a
few invited colleagues. It turns intentional capture into a calm, prioritized daily knowledge
experience:

> capture (desktop / iPhone) → durable ingest → extract, summarize, organize, prioritize → read →
> search, ask, revisit.

The knowledge experience is the product. Connectors are inputs, not the goal. Prioritize reliable
capture, useful summaries, good reading, traceable answers and tenant isolation over integration
breadth or enterprise complexity.

Production runs at `https://distilai.app` (Vercel, region `sin1`, Neon PostgreSQL). Phases 1–3 of
the roadmap in `docs/project-state.md` are complete; Phase 4 (mobile) onward is future work.

## 2. Session protocol

1. Read `docs/project-state.md`: the **Current handoff** section first, then the latest dated
   checkpoints. Treat older sections as historical evidence, not instructions.
2. Verify locally what the state file claims before acting on it: `git status`, branch, HEAD,
   `git worktree list`, and whether a dev server or test container is actually running. Do not
   assume recorded external state (deployments, Neon branches, CI runs) is still current.
3. Work on a short-lived branch from current `main` (see §7). Never overwrite uncommitted work by
   the other agent or by Amit; if the tree is dirty, stop and ask.
4. After material progress and before handoff, update `docs/project-state.md` (§8) in the same
   branch as the code change. Unfinished work must be recorded as unfinished.
5. Keep secrets, credentials, connection strings, personal data and captured content out of files,
   commits and output. Record variable names and masked resource identifiers only.

## 3. System of record and runtime shape

- **Framework:** Next.js 16 App Router + TypeScript, Tailwind v4, shadcn/ui, lucide-react.
  This Next.js version differs from older training data; consult `node_modules/next/dist/docs/`
  before writing framework-specific code.
- **Database:** PostgreSQL on Neon is the system of record. `src/lib/database.ts` is the
  composition root. It exposes `getTenantRepositories(AuthContext)` (Phase 3, tenant-bound),
  `getRepositorySet()` (legacy Phase 1 shape) and `getControlPlaneRepositories(SystemContext)`.
  Runtime driver is `postgres.js` (`src/lib/postgres/client.ts`, max 4 connections,
  `prepare: false` for Neon's pooler). Drizzle is used for the declarative schema in
  `src/lib/postgres/schema.ts` only; there is no `drizzle.config.ts`, so `db:generate` and
  `db:check` are not live workflows.
- **Migrations:** hand-written SQL, ledger table `distil_migrations`.
  `src/lib/postgres/migrations/0001–0004` (Phases 1–2) run through `npm run db:migrate`;
  `src/lib/postgres/tenant-migrations/0005–0009` (Phase 3 expand/backfill/contract/lifecycle/
  returning-auth) run through `npm run db:tenant:migrate` and are checked by
  `npm run db:tenant:verify`. Migrations use `DATABASE_MIGRATION_URL` (owner role); the app uses
  the restricted runtime role in `DATABASE_URL`. Row-level security is forced.
- **Legacy SQLite:** `src/lib/db.ts` (better-sqlite3) is a compatibility island. `database.ts`
  falls back to it only when `DATABASE_URL` is unset; `src/lib/notifications.ts` and
  `src/lib/sync-scheduler.ts` still import it directly. `scripts/import-sqlite.ts` migrates old
  local data. Do not add new SQLite code paths.
- **Edge entry point:** `src/proxy.ts` (Next.js `proxy`, not `middleware.ts`). It applies the
  connector kill-switch, CORS, auth, rate limiting, trace ids and private-cache headers.
- **Auth:** hosted Neon Auth (magic links, invitation-gated sign-up, no passwords or social
  providers) when `FEATURE_NEON_AUTH="true"`; otherwise the legacy single-user session bridge
  (`src/lib/auth/legacy-bridge.ts`). Production uses hosted auth. Invitations:
  `src/lib/auth/invitations.ts`, `scripts/auth-invitations.ts`, `/invite`. Capture clients use
  separate hashed, revocable capture tokens (`src/lib/auth/capture-tokens.ts`).
- **Tenancy:** `src/lib/contracts/tenant-context.ts` defines `AuthContext` (`userId`,
  `actorKind`, `actorId`, `sessionId?`, `requestId`) and `SystemContext`. Every repository call,
  queue message (`CaptureQueueMessageV2`, `TenantJobEnvelopeV1`), search, AI context assembly and
  worker must carry the verified user identity. Foreign and missing ids both return 404.
  `docs/authorization-matrix.json` is the machine-readable inventory;
  `docs/tenant-context-contracts.md` and `docs/phase-3-ownership.md` explain the boundary.
- **Capture and processing:** `POST /api/v1/captures` → `src/lib/capture/service.ts` (SSRF
  guard, normalized-URL dedupe, receipt) → Vercel Queue topic `capture-requests` →
  `src/app/api/queue/capture-requests/route.ts` → `src/lib/capture/worker.ts`. Receipt states:
  `queued → processing → ready | rejected | failed`, max 5 attempts. Extraction uses Readability
  with `src/lib/content-sanitizer.ts`; the worker also runs the deterministic knowledge-index
  step (content versions and chunks in `src/lib/knowledge/`). A second topic,
  `account-lifecycle`, handles export/deletion. Both are registered in `vercel.json`.
- **AI:** `src/lib/ai/ai-config.ts` is the single source of truth for task→provider/model
  assignment; `router.ts` adds cost accounting, daily/30-day budgets, retries and a circuit
  breaker. Summaries use Gemini with a budget-admitted same-provider fallback model and 15-second
  per-attempt timeouts. Prompts live in `src/lib/prompts/`. Search is PostgreSQL full-text first;
  embeddings are optional JSONB (no pgvector) and retrieval degrades explicitly.
- **Product surfaces (`src/app/`):** `/` Today's brief, `/feed` and `/feed/[id]` reader,
  `/search`, `/ask`, `/collections`, `/archive`, `/digests`, `/save`, `/settings`, `/account`,
  `/onboarding`, `/invite`, `/login`. Older `/topics`, `/sources`, `/research` and the agent
  routes remain but are secondary. Phase 2 surfaces sit behind `FEATURE_*` flags.
- **Capture clients:** `browser-extension/` (Chrome MV3, posts to `/api/v1/captures`, offline
  replay) and the iPhone Shortcut described in `docs/iphone-shortcut.md`. Gmail, Slack and the
  authenticated-publisher framework still exist in code but are disabled in hosted deployments
  (`FEATURE_CONNECTORS=false` returns 404 for their routes).
- **Feature flags** (`src/lib/phase2/feature-flags.ts`, exact string `"true"`, default off):
  `FEATURE_NEON_AUTH`, `FEATURE_CONNECTORS`, `FEATURE_KNOWLEDGE_UI`, `FEATURE_SEARCH`,
  `FEATURE_ANSWERS`, `FEATURE_PERSONALIZATION`, `FEATURE_DIGESTS`.
- **Deployment:** `docs/vercel-deployment.md` (topology and variable mapping) and
  `docs/runbooks/` (auth activation, backup/restore, account export/deletion, tenant-isolation
  incidents). Production builds are SHA-bound: `npm run build` runs the Phase 3 activation
  preflight, which requires `DISTIL_PHASE3_PRODUCTION_SHA` to equal the deployed commit.

## 4. Commands (verified against `package.json`)

```bash
npm run dev                  # Next.js dev server
npm run typecheck            # tsc --noEmit
npm run lint                 # eslint + prettier check of files changed vs origin/main
npm run format               # prettier --write .
npm test                     # all deterministic Jest suites
npm run test:unit | test:component | test:contract | test:security
npm run test:phase3-isolation      # tenancy / authorization-matrix / migration invariants
npm run test:integration     # PostgreSQL suites via Testcontainers (needs Docker) or DISTIL_TEST_POSTGRES_URL
npm run test:e2e             # Playwright web + mobile
npm run test:extension       # Playwright extension
npm run test:coverage        # coverage gate on changed code
npm run build                # activation preflight + next build
npm run db:migrate | db:tenant:migrate | db:tenant:verify
npm run eval                 # offline AI quality evals (evals/)
```

`npm run setup` and `scripts/setup.sh` are stale (they copy a `.env.example` that no longer
exists and assume SQLite); do not rely on them. The variable table in `docs/vercel-deployment.md`
is the current reference for environment names.

## 5. Testing conventions

Deterministic tests never contact hosted databases, AI providers, connectors or the internet.
Naming decides the runner: `*.unit.test.ts(x)`, `*.component.test.tsx` (jsdom docblock),
`*.contract.test.ts`, `*.security.unit.test.ts`, `*.integration.test.ts` (PostgreSQL),
`*.sqlite-integration.test.ts` (legacy compat), `*.live.test.ts` (opt-in only). Shared fixtures
and fakes live in `tests/support/`; the Phase 3 two-tenant harness in `tests/harness/`; security
specs in `tests/security/`; Playwright suites in `tests/e2e/` and `tests/extension/`. See
`tests/README.md` and `docs/phase-3-isolation-testing.md`.

Proportionate verification: run the suites that cover the surfaces you touched, plus
`npm run typecheck` and `npm run lint`. Run the full gate before a release candidate or when a
change crosses auth, capture, queue, migration or tenant boundaries. Do not repeat accepted checks
without a new risk. CI (`.github/workflows/ci.yml`) runs eight jobs aggregated by `quality-gate`;
`main` requires that check, the Vercel check, a PR with resolved conversations and linear history.

## 6. Code conventions

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

## 7. Branches, worktrees and ownership

- `main` is the integration and release branch, protected, linear history, merged branches
  auto-deleted. Historical phase branches are gone; five `archive/*` and `production/*` tags
  preserve milestones.
- Create short-lived branches from current `main` named `<agent>/<task>` (`codex/...` or
  `claude/...`). Include the `docs/project-state.md` update in the same branch. Delete the branch
  after verified integration.
- When both agents work concurrently, each uses its own `git worktree` and a non-overlapping
  ownership list recorded in the handoff section. One agent is the named **integration owner** and
  is the only one who reconciles `docs/project-state.md` conflicts and merges to `main`. Agents
  commit; they do not merge or rebase each other's branches.
- Never `git stash`, reset, checkout over, or delete another party's uncommitted changes or
  worktrees. If a worktree is dirty and not yours, leave it and report it.

## 8. What to record in `docs/project-state.md`

Keep the roadmap and principles stable near the top. Maintain the **Current handoff** section
(active objective, owner, branch/worktree, progress, decisions, blockers, verification, exact next
steps). Below it, append dated checkpoints; never rewrite historical evidence. Each checkpoint
states:

- what changed and why, with commit SHAs and PR links;
- tests run and results, separating **locally verified** facts from **previously recorded
  external state** (CI runs, deployments, Neon branches) that was not re-checked;
- external resources touched, by non-secret identifier only;
- unfinished work and exact restart steps.

Distinguish clearly between _implementation complete_, _verified_ (which checks, where) and
_deployed_ (which deployment, which origin).

## 9. Authorization boundaries

- Production releases, Vercel/Neon mutations, environment-variable changes, invitations to real
  people, data deletion and changes to the browser extension's production URL need task-specific
  authorization from Amit. Historical approvals recorded in the state file are evidence, not
  standing permission.
- Cloud, Preview and Production work follow the exact-SHA gate: a `main` commit passes CI, the
  release pin is updated, that commit is deployed, and both `distilai.app` and the legacy Vercel
  alias resolve to it.
- Reversible local work (code, tests, docs, local branches) proceeds without asking. Ask only for
  material missing decisions; state assumptions otherwise.
- Do not start a new roadmap phase or expand connector scope without an explicit decision recorded
  in the state file.
