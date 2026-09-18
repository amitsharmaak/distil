# Distil project roadmap and state

Last updated: 2026-09-17 (Asia/Kolkata)

This is the canonical, durable restart point for the Distil project across development sessions.
Keep the product roadmap stable near the top and continuously update the active-phase status,
decisions, resources, evidence, blockers, and exact next steps below it. Read this file before
resuming work, and update it whenever material progress or a roadmap decision is made. It
intentionally contains no passwords, tokens, database connection strings, session secrets, or AI
provider keys.

## Current handoff — 2026-09-17

This section is the only forward-looking instruction block in this file. Everything from
"Current cross-phase status" downward is a dated historical record; keep it as evidence and do not
reinterpret it as a task list. Shared working rules for both agents live in `AGENTS.md`.

- **Active objective:** Post-Phase-3 steady state. Use Production on `https://distilai.app` for
  ordinary capture and reading, adding items one at a time and checking capture, readable
  extraction, summary and search. No new phase has started; Phase 4 (mobile) is not authorized.
- **Performance overhaul complete: every phase P0–P7 merged and released (P5 as PR
  [#36](https://github.com/amitsharmaak/distil/pull/36), `715c06f`, 2026-09-18), and P7's
  `perf-indexes` stage applied to Production on 2026-09-18 (checkpoint "P7 migration applied to
  Production — 2026-09-18"):** the
  checkpoint "Performance analysis and phased plan — 2026-09-16" below records a verified analysis
  and eight PR-sized phases P0–P7. Amit picks one phase per task, in order, each on its own
  `claude/<task>` branch with a dated checkpoint. P0 (measurement baseline) merged as PR
  [#21](https://github.com/amitsharmaak/distil/pull/21) (`f1cb2ac`). P1 (one auth verification
  per request and a signed identity handoff) merged as PR
  [#22](https://github.com/amitsharmaak/distil/pull/22) (`f2e4155`) and is live on Production;
  see the checkpoints "Performance P1 released — 2026-09-17" (live numbers) and "Performance P1:
  one auth verification per request — 2026-09-17" (design and local before/after) below. Codex
  completed P4 on `codex/perf-bundle` (owns `src/components/**`, `src/app/layout.tsx`,
  `next.config.ts`, `tsconfig.json`, `public/**`, `src/lib/ai/**`, the legacy route deletions and
  the route counts in `docs/authorization-matrix.json`), based on `53edd84`; its checkpoint below
  records the target exception and release verification. P2 (one shared pool, one tenant
  transaction per request with the verification folded into one statement, summary projections
  and keyset neighbours) merged as PR [#26](https://github.com/amitsharmaak/distil/pull/26)
  (`a06d0d7`) and is live on Production; see the checkpoints "Performance P2: database
  round-trip diet — 2026-09-17" (design and local before/after), "PR review, merges and
  cleanup — 2026-09-17" (integration, gates, release) and "Performance P2 released —
  2026-09-17" (live Production numbers) below. P6 (AI cost and latency: per-capture brief
  summary, accounting off the critical path, answer cache, provider bounds) merged as PR
  [#30](https://github.com/amitsharmaak/distil/pull/30) (`637d923`) and is live on Production;
  see "Performance P6: AI cost and latency — 2026-09-17" (design and local evidence) and
  "Performance P6 released — 2026-09-17" (release, what is still unverified) below. P3
  (`codex/perf-client-network`, Codex) merged as PR
  [#32](https://github.com/amitsharmaak/distil/pull/32) (`b815e6d`) after its Quick and Full
  gates passed; Claude reviewed and merged it as integration owner at Amit's request; see
  "Performance P3: client payload and network — 2026-09-17" below. P7 (`claude/perf-indexes`)
  is implemented, locally verified and merged with `main` at `b815e6d` (code merged cleanly; only
  this file conflicted); see "Performance P7: indexes — 2026-09-17" below for the RLS planner
  finding that reduced it to one index plus the `content_hash` column, and for the Production
  migration run that still needs Amit's separate approval. P5 remains unstarted.
- **Owner:** Amit decides direction. Claude Code and Codex work from repository files only.
  The concurrent P2/P4 pair and the concurrent P3/P7 pair (Codex owned `src/components/**`,
  `src/app/**`, `src/lib/public-config.ts`, `next.config.ts`, `docs/authorization-matrix.json`,
  `tests/e2e/**`; Claude owned the PostgreSQL migration, schema, feed-query, scripts and
  harness/security test paths) are integrated by Claude as integration owner. No ownership split
  is in force once P7 merges.
- **Branch / worktree:** `main` at `715c06f` (squash merge of PR
  [#36](https://github.com/amitsharmaak/distil/pull/36), P5) on 2026-09-18, after `1115133`
  (#35) and `1cc670e` (#34, the jsdom runtime fix) on 2026-09-17,
  after `16c4c31` (#33, P7), `b815e6d` (#32, P3), `58a4a9c` (#31), `637d923` (#30, P6),
  `eb557a7` (#29), `c85f336` (#28), `a06d0d7` (#26, P2), `0d5e689` (#27, local loop),
  `9f0caf6` (#25) and `f295124` (#24, P4). No PR is open.
  Every merged task branch and worktree is deleted; the main checkout
  (`/Users/amitsharma/Projects/distil`) is on `main`. The only remaining Claude worktree besides
  the one that wrote this checkpoint is `.claude/worktrees/jabra-evolve-mic-test-7167d1`
  (branch `claude/jabra-evolve-mic-test-7167d1`, clean, no commits beyond `22cd7aa`, unrelated
  to Distil work; left for Amit to remove). Task branches follow the parallel-session routine in
  `AGENTS.md` §7.1 (one session per branch, branch from `origin/main`, merge not rebase,
  `/start-task` and `/finish-task`).
  Production serves release `715c06f` (P5) as GitHub deployment `6518568715` on
  `distilai.app` (status `success`, `/api/health` 200, checked 2026-09-18); before it
  `1cc670e` (jsdom fix, deployment `6508492409`); the
  P3 (`b815e6d`) and P7 (`16c4c31`, deployment `6506943120`) merges auto-deployed before it.
  The Production library holds one item, captured by Claude from Amit's session on 2026-09-17
  ("How to Do Great Work", `261ff287-d316-4db9-bc5d-0771b881f90c`); archive or keep it.
  Release pin `DISTIL_PHASE3_PRODUCTION_SHA` = `unpinned` since 2026-09-16 (iteration phase):
  every push to `main` auto-deploys to Production through Vercel's Git integration; the P4
  (`6498811802`), local-loop (`6499086682`) and P2 deployments all arrived that way. The legacy
  alias `distil-pv-1850.vercel.app` is not a project domain, so it does not follow automatic
  deployments and must be re-aliased explicitly (`npx vercel alias set <deployment>
distil-pv-1850.vercel.app`) whenever it should match `distilai.app`; it still points at the P1
  release `f2e4155` and was not re-aliased today. No manual deploy, migration or
  environment-variable change was made today.
- **Local iteration loop (merged 2026-09-17, PR
  [#27](https://github.com/amitsharmaak/distil/pull/27), `0d5e689`):** Amit captures articles
  into a laptop-only PostgreSQL (Docker, in-process capture worker, legacy password login) and
  ships fixes to Production in batches. Runbook `docs/runbooks/local-development.md`; checkpoint
  "Local development loop — 2026-09-17" below. Local data is independent of Production and is
  wiped with `npm run db:local:reset`.
- **Progress at this checkpoint (password login, 2026-09-11 to 2026-09-16, complete and
  deployed):**
  - Email/password sign-in added alongside magic links, no 2FA (PR #7, `7278326`): hosted Neon
    Auth credential provider behind Distil-gated routes `POST /api/auth/sign-in/password`,
    `/api/auth/password/request-reset`, `/api/auth/password/reset`, `/api/auth/password/change`;
    no local password storage; 12-character minimum; per-IP and per-account rate limits;
    anti-enumeration preserved; first password set through the provider's emailed reset link;
    account center can change the password (revokes other sessions) or request a setup link.
    ADR 0004.
  - Neon Auth "Sign-in with Email" enabled for the Production branch
    (`br-damp-wildflower-b3kw15cu`) via the console on 2026-09-16; other provider settings left
    as found.
  - Sign-in redirect bug fixed (PR #11, `ec9758a`): a successful password sign-in now performs a
    full navigation (`src/lib/browser-navigation.ts`) because the app shell's prefetches had
    cached the anonymous redirect to the sign-in page.
  - Dedicated `https://distilai.app/sign-in` page (PR #12, `847a068`); `/invite` is invitation
    acceptance only and forwards to `/sign-in` without a token; every login redirect targets
    `/sign-in`; anonymous pages render without the authenticated shell.
  - Releases: `7278326` (`dpl_37haDb3zFz1moUGpw7LS7JECyyBH`), `ec9758a`
    (`dpl_GYe6JtxFxX1NpydW6K7MmX2wrT6G`), `847a068` (`dpl_EP5sasTc2PWDzdgRRrGSmrHcZWRB`), each
    through the exact-SHA gate with both origins re-aliased.
  - Smoke evidence: Amit set a password through the emailed link and the sign-in route returned
    200 for his credentials (Vercel runtime logs, 2026-09-16) before the redirect fix; after the
    fix, both origins serve the release and route anonymous requests to `/sign-in`. Amit decided
    on 2026-09-16 not to change the password or run the remaining smoke now; landing on Today
    after password sign-in, the change-password form and the magic-link fallback on the final
    release are therefore unverified by a person and remain an optional check, not a blocker.
- **Integration (2026-09-16):** branch `claude/integrate-tiering-ui` combines the two open task
  branches on top of `main`: `claude/test-tiering` (PR
  [#15](https://github.com/amitsharmaak/distil/pull/15), Tier 0 `check:quick`, Tier 1 `check` as
  the only required CI check, Tier 2 nightly "Full gate", release pin may be `unpinned`) and
  `claude/ui-simplification` (PR [#8](https://github.com/amitsharmaak/distil/pull/8), simplified
  navigation, reader chrome, top bar, settings and feed toolbar). The only conflict was this
  file; the UI branch's own record is kept as the checkpoint "UI simplification — 2026-09-11"
  below. Merged to `main` through the integration PR and released to Production the same day
  (see the checkpoint "Tiering and UI simplification released; pin unpinned" below).
- **Decisions recorded here:** `AGENTS.md` describes architecture; `CLAUDE.md` holds only
  Claude-specific notes; progress is recorded only in this file. Task branches are named
  `<agent>/<task>` (`codex/...` or `claude/...`). Concurrent work requires separate worktrees and a
  written ownership split in this section.
- **Performance decisions (Amit, in chat, 2026-09-16):** (1) authentication keeps exactly one
  uncached provider check per request, so a revoked session is still rejected on the next request;
  the variant that trusts the signed session cookie for GETs is not pursued. (2) Delete the
  unlinked `/sources`, `/topics`, `/research` routes, the never-called AI modules
  (`src/lib/ai/tagger.ts`, `src/lib/agent/workflows/triage.ts`, `src/lib/agent/insight-detection.ts`,
  `runAgent` in `src/lib/agent/orchestrator.ts`, `src/lib/ai/client.ts`,
  `src/lib/ai/circuit-breaker.ts`), `src/lib/notifications.ts` and the unmounted
  `src/components/agent/agent-status-panel.tsx`. (3) Generate one budget-admitted flash-lite brief
  summary per capture in the queue worker, cached under a content hash; on-demand regeneration in
  the reader stays; nightly digests were not selected. (4) Execute all phases P0 → P7 in order, one
  phase per task. Defaults applied unless Amit says otherwise: no cross-tenant article cache; add
  `babel-plugin-react-compiler` at the end of P4; running the P7 index migration in Production is a
  separate approval.
- **Blockers / open items (all non-blocking):**
  - P4 reduced the shared first-load bundle from 169.3 to 132.8 KB gzip but did not reach the
    brief's under-120 KB target: 130.7 KB is Next.js/React/Turbopack framework code before the
    remaining Distil shell. The reader target is met at 155.0 KB gzip. This is a recorded P4
    deviation, not a reason to move framework code or touch P3/P5-owned paths.
  - The deferred bug backlog (`BUG-PWA-001/002`, `BUG-IOS-001/002`, `BUG-CONTENT-001`,
    `BUG-SEARCH-001`, `BUG-READER-001`) below remains open and unscheduled.
  - Known functional gap found during the performance analysis: the tenant job types
    `regenerate_intelligence_summary`, `digest_run` and `knowledge_backfill` are enqueued but no
    handler is registered (`src/lib/jobs/tenant-runtime.ts` completes them as "No tenant handler
    registered"), so the nightly digest cron in `vercel.json` is write-only. Amit chose not to add
    digest work now; either register handlers or stop enqueuing in a later task.
  - Resolved 2026-09-16: the concurrent docs branches `claude/pwa-reinstall-notes` (PR #18,
    `735ee4d`) and `claude/perf-plan` (PR #19, `22cd7aa`) both merged; both checkpoints kept.
  - Two files of the branch-workflow tooling could not be written by Claude Code because the
    auto-mode classifier refused them: the shared `.claude/settings.json` (permission allowlist,
    `worktree.baseRef`) and `.claude/skills/finish-task/SKILL.md`. Amit adds them by hand from
    the checkpoint "Branch workflow tooling — 2026-09-16" below.
- **Verification of the integration branch (locally verified 2026-09-16, full gate on the
  combined tree at `54e8263`):** `npm run lint` 0 errors / 10 baseline warnings, Prettier clean;
  `tsc --noEmit` clean; `npm test` 201 suites / 1446 tests passed; `npm run test:integration`
  (Docker PostgreSQL) 12 suites / 44 tests passed; `npm run test:e2e` 27 passed / 3 skipped
  across desktop-chromium, mobile-chromium and mobile-webkit; `npm run test:extension` 11
  passed; `npm run build` succeeded. Codex/Claude sessions are not shared, so this is the only
  record of that run.
- **Verification of the preceding releases (locally verified 2026-09-16 unless noted):** every PR
  (#7, #9, #10, #11, #12, #13) passed the full quality gate (static, unit/component/contract,
  security, PostgreSQL integration, coverage, web/mobile and extension E2E, production build) and
  the exact-head `main` run after each merge. Local: `npm test` 201 suites / 1440 tests,
  `tsc --noEmit`, lint (0 errors, 10 baseline warnings), Prettier. Production: health 200 with
  `cache-control: no-store` on both origins; `/sign-in`, `/invite`, `/reset-password` 200; the
  password routes answer 403 without an allowed Origin; anonymous `/feed` redirects to
  `/sign-in`. The local `.env.local` has no `DATABASE_URL`, so a local `npm run dev` runs the
  legacy SQLite path and is not representative of Production; Postgres integration tests need
  Docker or `DISTIL_TEST_POSTGRES_URL`.
- **Previously recorded external state (not re-checked today):** Production library
  intentionally empty; one user and one capture token; Neon Auth project `distil-preview-db`
  with the single existing user.
- **Optional password-login check (deferred by Amit on 2026-09-16):** sign in at
  `https://distilai.app/sign-in`, confirm the Today page loads, change the password once from
  `/account`, and confirm "Email me a magic link instead" still works. If the emailed reset link
  ever lands somewhere other than `/reset-password?token=...`, adjust the page first.
- **Operational note:** Amit added local, gitignored Claude Code permission rules on 2026-09-16 so
  Claude Code can merge green PRs, update the release pin, deploy and re-alias without a manual
  step. The exact-SHA gate and the task-specific authorization rule in `AGENTS.md` §9 are
  unchanged: releases still happen only when Amit asks.
- **Exact next steps:**
  1. **Amit: fix the Production AI credential.** The first live capture (checkpoint "First
     live capture and the jsdom runtime fix — 2026-09-17") extracted and indexed correctly, but
     the P6 brief summary was skipped with `AIProviderError AI_AUTHENTICATION`: the Gemini API
     key in Vercel's Production environment is rejected by the provider. Replace
     `GEMINI_API_KEY` in Vercel (Production) with a valid key, redeploy (or push any commit), then
     open the reader for the existing item and request a brief summary; expect a summary and no
     `capture_summary_skipped` in the runtime logs. Claude does not read or write provider
     secrets. Until then every capture lands without a generated summary (extractive brief only)
     and on-demand summaries fail the same way.
  2. Done 2026-09-18: the P7 `perf-indexes` stage is applied to Production (checkpoint "P7
     migration applied to Production — 2026-09-18" below). `ai_summaries.content_hash` now exists
     there; wiring it into the summary cache key is P6's deferred item and a small follow-up.
  3. Amit: look at Today, Feed, the reader and Settings at phone width and desktop (the
     simplified shell and P3's same-origin client have now been exercised by Claude through the
     in-app browser but not seen by a person), and make one browser-extension capture (the
     in-app `/save` path is verified; the extension path is not). Update the iPhone Shortcut API
     base to the apex before its next capture.
  4. Rely on the 02:30 UTC nightly Full gate; if the "Nightly full gate failed" issue opens,
     treat it as the first task of the next session.
  5. Performance overhaul: done. P5 is live (`715c06f`); on the next signed-in session read
     LCP/TTFB for `/` and `/feed` on Production (expect content in the first HTML, TTFB about
     +50 ms on Neon, no `/api/v1/feed` request on load) and note it in a checkpoint. The
     remaining performance work is not in the plan: the RLS/ordering architecture question from
     P7 (ordered index scans cannot cross the security barrier) and the ~124 ms
     `proxy-auth-db` lookup, each a separate decision. The
     live numbers show `proxy-auth-db` at about 124 ms per request on Neon
     (`distil_resolve_auth_identity`, a SECURITY DEFINER lookup on `auth_identities`, outside
     P7's RLS finding); it remains the largest fixed per-request cost and is the next
     measurable target after P5. Amit's decision is still open on the two P7 indexes the RLS
     planner cannot use (checkpoint "Performance P7: indexes — 2026-09-17"); adding them anyway
     is a one-file `0011` stage.
  6. Other engineering candidates, each as its own short-lived branch with a state update: the
     dead `notifications.ts` module and the unlinked `/topics`, `/sources`, `/research` routes are
     now deleted in phase P4 of the performance plan; small mobile-web fixes `BUG-PWA-001/002` and
     the Shortcut URL extraction `BUG-IOS-001` remain. Phase 4 mobile work starts only on an
     explicit decision.

### First live capture and the jsdom runtime fix — 2026-09-17

At Amit's "go ahead and do what's needed", Claude made the first deliberate Production capture
from Amit's signed-in in-app browser session (`/save`, `https://paulgraham.com/greatwork.html`)
to exercise P6's per-capture summary and P3's same-origin client.

**It failed.** The capture receipt reported `Failed to load external module jsdom-…:
Error [ERR_REQUIRE_ESM]: require() of ES Module …/@exodus/bytes/encoding-lite.js from
…/jsdom/node_modules/html-encoding-sniffer/lib/html-encoding-sniffer.js not supported`. Every
Production capture had been failing this way since 2026-09-07, when the dependency-security
commit `5ae4215` raised `jsdom` from `22.1.0` to `30.0.1` — the same day two earlier commits
(`e553002`, `ab85d28`) had backed jsdom down from 28 to 27 to 22.1.0 for exactly this reason.
The library was empty from the 2026-09-10 reset onward, so no capture had been attempted since.

**Root cause, measured rather than inferred.** A temporary Preview-only probe on `/api/health`
(branch `claude/capture-jsdom-runtime`) reported the Lambda as Node `24.19.0` with
`process.execArgv` containing `--no-experimental-require-module` and
`--no-experimental-detect-module` and `process.features.require_module === false`, and a real
`require("jsdom")` from `/var/task` reproduced the error. Vercel starts Next.js functions with
`require(esm)` disabled, so any CommonJS package that requires an ES module fails on every Node
version. jsdom ≥ 23 depends on ESM-only `parse5@8`; jsdom ≥ 27.4 also on `@exodus/bytes`.
Locally the same failure reproduces with `node --no-experimental-require-module -e
"require('jsdom')"`.

**Fix — PR [#34](https://github.com/amitsharmaak/distil/pull/34), merged as `1cc670e`, deployed
as `6508492409`:** `jsdom` pinned to `22.1.0` (the last all-CommonJS runtime graph; its
`form-data` resolves to the patched `4.0.6`, so the 09-07 advisory does not return and
`npm audit --omit=dev` is unchanged from `main`), `@types/jsdom` `^21.1.7`,
`docs/security-audit.md` corrected. New `tests/harness/vercel-runtime-externals.unit.test.ts`
loads `jsdom`, `@mozilla/readability`, `postgres`, `pino` and `better-sqlite3` in a child Node
under Vercel's two flags and fails on jsdom 30. `/api/health` reports `runtime.node` and
`requireModule` on Preview deployments only; the Production body is unchanged. Gates: `npm run
check` 207 suites / 1,486 tests; Full gate green on the PR.

**Second capture, on `1cc670e`: works.** Receipt `queued → ready` in under ten seconds; item
`261ff287-d316-4db9-bc5d-0771b881f90c`, title "How to Do Great Work", `sourceType: manual`,
reader page 200 with the extracted article. Live numbers from the same session:

| Request                                 | Result                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /api/v1/feed?sort=recent` (1 item) | 774 bytes on the wire, no `fullContent` on the row (P2 projection); `db` 43.0 ms `q=3 tx=1` |
| `GET /api/v1/items/<id>/state`          | `db` 21.6 ms **`q=2 tx=1`** (P2 target, previously unmeasurable on an empty library)        |
| `GET /feed/<id>` (reader, warm)         | proxy 216–218 ms (`calls=1 q=1`); the first cold read showed `proxy-auth-db q=2` 631 ms     |
| P3 client                               | all requests same-origin `/api/...`; the feed made no status polls (no processing rows)     |

**P6 on a live provider: the safety net worked, the summary did not.** The queue worker logged
`capture_summary_skipped` with `AIProviderError` code `AI_AUTHENTICATION` and the capture stayed
`ready` (extractive brief only; the summaries endpoint returns 404 for the item). The Gemini
credential in Vercel's Production environment is rejected by the provider; the 2026-09-10
checkpoint had already noted that "the separate Production provider credential … was not read or
changed". Claude did not read, rotate or replace it (secrets stay with Amit); handoff step 1 is
that replacement. Nothing else was deployed or changed; no migration ran (handoff step 2).

### P7 migration applied to Production — 2026-09-18

Amit ran the stage from his own terminal; the connection string never passed through Claude.
`vercel env pull` could not be used because `DATABASE_MIGRATION_URL` is a Sensitive variable in
Vercel (the CLI writes `[SENSITIVE]` placeholders), so Claude drove the Neon console through
the Chrome extension to the `distil-production` branch's Connect dialog (role `neondb_owner`,
database `neondb`, pooling off, host `ep-delicate-frog-b3g28rqu.c-4.ap-southeast-1.aws.neon.tech`)
and Amit copied the URL from there into `DATABASE_MIGRATION_URL="$(pbpaste)"` for each command.
The temporary `.env.production.local` was deleted.

Ledger before: expand, backfill, contract, lifecycle (2026-09-09) and returning-auth
(2026-09-10), all owner `3844a094-2018-4118-83f4-874e7081568d`. Command:
`npm run db:tenant:migrate -- --stage perf-indexes --amit-user-id 3844a094-2018-4118-83f4-874e7081568d`
→ `Applied perf-indexes: 0010_perf_indexes.sql` (one benign `NOTICE` from the migrator's
`CREATE TABLE IF NOT EXISTS`). Verified afterwards with read-only queries on the same
connection: ledger row `perf-indexes` / `0010_perf_indexes.sql` applied `2026-09-18T10:56:57Z`;
`pg_indexes` contains `item_events_user_type_occurred_idx`; `information_schema.columns`
contains `ai_summaries.content_hash text`. Neon project `floral-river-70536503`, branch
`br-damp-wildflower-b3kw15cu`. No application code, deployment or environment variable changed.
Rollback remains `DROP INDEX item_events_user_type_occurred_idx; ALTER TABLE ai_summaries DROP
COLUMN content_hash;` plus deleting the ledger row.

### Performance P5 released — 2026-09-18

Claude reviewed PR [#36](https://github.com/amitsharmaak/distil/pull/36) as a second pass over
its own work (fallback never bypasses API authentication; the page's auth path is the reader
page's live pattern; server/island key agreement is test-pinned; the CI e2e job exercises the
no-session fallback on the production build) and merged it at Amit's request as `715c06f`
after the Quick gate and every Full gate job, including the mobile Playwright projects, passed.
Auto-deployed as GitHub deployment `6518568715` (`success`); `/api/health` 200. No migration,
environment-variable, release-pin or Neon change; the legacy alias still points at the P1
release. This closes the eight-phase performance plan; the Production LCP/TTFB reading for
`/` and `/feed` is the one number still to take (handoff step 5).

### Performance P5: server-render `/` and `/feed` — 2026-09-18

Branch `claude/perf-server-render` (worktree `.claude/worktrees/perf-server-render`, from
`origin/main` `1115133`), commits `2d76172` (implementation) and `f8be846` (measurement-driven
corrections). Nothing deployed.

**What changed**

- `src/lib/feed/feed-params.ts`: the one feed query contract — `feedQuerySchema`,
  `parseFeedQuery`, `feedListQuery`, `loadFeedPage` (preferences → page → optional stale
  resurfacing, on an already-bound repository set) and `todayFeedParams`. `GET /api/v1/feed` is
  refactored onto it (contract tests unchanged). `src/lib/feed/feed-url.ts` holds the
  client-safe URL helpers (`feedFilterState`, `feedRequestSearch`, `feedFilterKey`,
  `dateQueryValue`); `src/lib/feed/today-selection.ts` the presentation mapping. Both are
  deliberately zod-free because the client island imports them.
- `src/lib/server-render/page-data.ts`: `loadPageData(route, operation)` reads `headers()`
  first (so the route is always dynamic; see below), resolves the user through the proxy's
  identity handoff, runs `operation` in one `withTenantRepositories` transaction, and returns
  `null` — meaning "render the island and let it fetch" — without PostgreSQL, with
  `FEATURE_SERVER_RENDER=false` (the one-release escape hatch, read `!== "false"`), when the
  request has no resolvable user (`AccessDeniedError`; only reachable where the proxy has let an
  anonymous request through, i.e. test mode), or on a data failure (logged).
- `/feed` (`src/app/feed/page.tsx`) is an async server component: it parses `searchParams`
  through the shared schema, runs the feed page and `collections.list()` in one transaction
  and renders `<FeedList initialPage>` (`src/components/feed/feed-list.tsx`). The island treats
  the URL as the single source of truth: every filter change is
  `router.replace(url, { scroll: false })` inside a transition (the server renders the next
  page; the current list stays visible, dimmed), load-more uses `/api/v1/feed?cursor=`, the
  bounded `/api/v1/items/status` poll is unchanged, and `?q=` search still uses `/api/items`
  client-side. A server page whose key does not match the URL is ignored.
- `/` (`src/app/page.tsx`) runs Today's selection (six priority items plus the stale strip)
  server-side; `TodayExperience` takes `initial` and is presentational, keeping the API fetch
  only as the fallback. `force-dynamic` is gone from both pages.
- Deleted `src/app/loading.tsx` and `src/app/feed/loading.tsx` (see the finding).
- Tests: server-page tests for `/` and `/feed` with fake repositories (one `loadPageData`
  call, exact `feed.list` arguments, island props, search and invalid-URL bypasses), loader unit
  tests (headers before env checks, `AccessDeniedError` → null, other errors rethrown, data
  failure logged), island tests (server-page mode makes no request, key mismatch refetches,
  load-more appends, each filter change is a `router.replace` URL; the old client-fetch
  contract is retained), flag test, matrix `pageLoaders` entries for `/` and `/feed`. A stale
  `spyOn(global, "clearInterval")` in the old page test was leaking into later tests and is now
  restored. `tests/e2e` mocks are untouched: the suite runs without a session, so it exercises
  the fallback island exactly as before (9 passed / 1 flag-skipped locally).
- `scripts/perf/measure-web-vitals.ts` now records every LCP candidate element and size,
  browser console errors, and with `--dump-html` writes each route's document to `.perf/`.

**Finding that changed the brief: streaming made it slower.** The first build followed the
brief (page data behind the existing `loading.tsx` Suspense boundaries). `perf:vitals`
(production build, Docker PostgreSQL, legacy session, 5 runs) showed `/feed` LCP going from
96 ms (client fetch) to **340 ms**, with the LCP element — the first article summary — present
in the HTML at ~50 ms but painted at 344 ms. The dumped document shows why: React 19's Fizz
runtime emits `requestAnimationFrame(() => $RT = performance.now())` after the shell and its
`$RC` reveal script schedules every later boundary reveal at `$RT + 300 ms`. A boundary that
resolves 15 ms after the shell is deliberately held until ~340 ms. A single boundary is not
exempt (the shell's own paint sets `$RT`). The reader page `/feed/[id]` had been paying the
same 300 ms since P2 without anyone noticing, because its LCP candidate lives in the shell.
Two further corrections from the same measurements: (1) the first version was **statically
prerendered** at build time because the `DATABASE_URL` guard ran before `headers()`, so
Production would have served the fallback to everyone — `loadPageData` now reads the request
first and the unit test pins it; (2) the island's import of the schema module pulled zod into
the client bundle (+87 KB chunk), hence the `feed-url.ts` split.

Decision (Claude, recorded for Amit): the page data blocks the document instead of streaming.
`app/loading.tsx` and `app/feed/loading.tsx` are removed; client navigations keep the
previous page until the next one is ready (and `FeedList` shows the pending state during
filter transitions), which for a 15–50 ms read is better than a skeleton flash plus a 300 ms
throttled reveal. The `cacheComponents: true` spike was run and not adopted: the build fails on
the `runtime`/`dynamic` segment exports of four routes before the Suspense requirement is even
reached, and that requirement would reintroduce exactly this throttle around every per-user
read.

**Before → after** (`perf:vitals`, identical instrumentation on `origin/main` `1115133` and
`f8be846`, medians of 5):

| Page         | LCP          | TTFB      | Requests | API calls | Bundle (gzip) |
| ------------ | ------------ | --------- | -------- | --------- | ------------- |
| `/`          | 100 → 40 ms  | 8 → 17 ms | 40 → 37  | 2 → 0     | +140 B        |
| `/feed`      | 96 → 52 ms   | 5 → 18 ms | 45 → 46  | 2 → 0     | +110 B        |
| `/feed/[id]` | 36 → 44 ms\* | 9 → 17 ms | 40 → 38  | —         | 0             |

\* The reader's LCP candidate is a shell element; its article body, previously revealed at
~340 ms by the same throttle, now appears with the document (~45 ms). Server-side the page
reads cost `headers` 0 ms, auth 3 ms (handoff, zero I/O), data 9–15 ms locally; on Neon expect
about +50 ms TTFB against −300 ms to content.

**Verification (local, `f8be846`)**: `npm run check` 210 suites / 1,499 tests, lint 0 errors /
5 baseline warnings, Prettier and `tsc` clean; `npm run test:e2e` desktop-chromium 9 passed / 1
skipped; `npm run build` with `/` and `/feed` both `ƒ (Dynamic)`; `npm run perf:bundle` against
a fresh `main` baseline as above; `perf:vitals` as above.

**Not verified**: Production numbers (needs a signed-in session after the merge); the mobile
Playwright projects were not run locally (Full gate runs them).

### Performance P7: indexes — 2026-09-17

Branch `claude/perf-indexes` (worktree `.claude/worktrees/perf-indexes`, from `origin/main`
`58a4a9c`), implementation commit `d43dd54`, run concurrently with Codex's P3 under the
ownership split in the handoff. Nothing deployed; no migration run anywhere but local Docker.

**Finding that changed the brief.** The brief asked for three indexes. `EXPLAIN` through the
restricted runtime role (`tests/security/phase3-wave4-query-plans.integration.test.ts`, two
tenants, 2,000 items each) showed that forced row-level security makes PostgreSQL plan every
tenant table as a security-barrier subquery in isolation (`Subquery Scan on i` → `Result` with a
one-time RLS filter → index scan on the tenant index). Consequences, each verified with
`enable_sort`/`enable_seqscan` toggles and an owner-role control plan:

- An ordered index `items(user_id, created_at DESC, id DESC)` can never serve the feed's outer
  `ORDER BY created_at DESC, id DESC LIMIT n`: the subquery is planned without the outer sort
  keys, its ordered path is pruned, and a top-N heapsort over the tenant's candidate rows always
  remains. The owner role (no RLS) uses the same index with no Sort, which proves the shape is
  right and the barrier is the cause. The partial predicate in the brief (`processing_status =
'ready' AND archived_at IS NULL`) would also not have matched the feed's `<> 'rejected'`
  filter or `list()`'s missing archive filter.
- A GIN index on `items(topics)` is unreachable for the runtime role: `?|` (topic facet) and `?`
  (affinity overlap) are not leakproof, so they are evaluated above the barrier (`Subquery Scan
… Filter: (i.topics ?| …)`, 2,000 rows read to keep 3). `jsonb_path_ops`, as written in the
  brief, would not have served `?|` even without RLS. The same applies today to the existing FTS
  `items_search_idx` (`@@` is not leakproof; the search plan filters above the barrier).
- Equality, `= ANY`, `<>` and `IS NULL` predicates are leakproof and are pushed inside the
  barrier, so tenant-leading btree indexes do work as index conditions.

Decision (Claude, recorded for Amit to overrule): create only what the planner can use.

**What changed**

- `src/lib/postgres/tenant-migrations/0010_perf_indexes.sql`, new tenant stage `perf-indexes`
  (after `returning-auth`; `TENANT_MIGRATION_STAGES`, the ledger `CHECK`, `scripts/migrate-tenant.ts`
  usage, `scripts/local-db-reset.ts`, `scripts/perf/measure-web-vitals.ts`, `AGENTS.md` §3 and
  the backup runbook updated): `item_events(user_id, event_type, occurred_at DESC)` as
  `item_events_user_type_occurred_idx`, and `ai_summaries.content_hash text` (nullable, unused
  until the AI cache keys on it). Plain `CREATE INDEX IF NOT EXISTS` inside the ledger
  transaction (`CONCURRENTLY` cannot run there; the library is tiny). Both mirrored in
  `src/lib/postgres/schema.ts`. Rollback is `DROP INDEX` / `DROP COLUMN`.
- `src/lib/feed/feed-query.ts`: the explicit-signal affinity is a `LEFT JOIN LATERAL (...)
affinity_signal ON TRUE` computed once per candidate row; the SELECT list, the keyset cursor
  predicate and `ORDER BY` all read `COALESCE(affinity_signal.score, 0)` instead of repeating a
  correlated subquery (three to five evaluations per row before). Personalization off or
  non-`for_you` sorts add no join. `explainFeedRank` and the cursor contract are unchanged.
- Tests: `tenant-migrator.unit` (stage order), `tests/harness/migration-invariants.unit` (the
  migration is additive, has no `ON items`/GIN statement, no `CONCURRENTLY`, no grants),
  `feed-query.unit` (exactly one `LEFT JOIN LATERAL` and one `FROM item_events` per personalized
  statement, none otherwise), `feed-query.integration` (a one-day-old `completed` signal gives
  `3·2^(−1/60)` affinity to items sharing source, content type or topic and 0 to one sharing none,
  and every row's PostgreSQL score equals `explainFeedRank`), `phase3-wave4-query-plans.integration`
  (`P7-IDX-001`: the signal scan enters through a tenant `item_events` index with
  `Index Cond: (user_id =` and no global scan; the feed keeps its `Subquery Scan` + `Sort`; the
  topic facet filters above the barrier — the last two are asserted so a change is noticed).

**Verification (local, `d43dd54`)**: `npm run check` — lint 0 errors / 6 baseline warnings,
Prettier clean, `tsc` clean, 204 suites / 1,468 tests; `npm run test:integration` (Docker,
PostgreSQL 16.15) 12 suites / 47 tests. Before/after: the personalized feed statement issues
the affinity subquery once per row instead of 3–5 times (unit-asserted); on a 3-item fixture the
ranking is identical. No hosted measurement: the Production library is empty and the migration
has not run there.

**Follow-ups, not started**: (1) if feed ordering must scale past a few thousand items per
tenant, the ORDER BY has to be evaluated inside the RLS barrier — a `SECURITY DEFINER` feed
function or a policy-free read path — which is an architecture decision, not an index; (2) the
`ai_summaries.content_hash` cache key (P6's deferred item) can now be wired once the Production
stage has run; (3) the affinity `LATERAL` is still O(items × signals) per page — an
`item_events` pre-aggregation per tenant would be the next step if `for_you` gets slow.

**Synced 2026-09-17** onto `origin/main` `b815e6d` (P3) with `git merge`; `feed-query.ts` (P3's
`resurface=stale` conditions, P7's LATERAL) and `scripts/perf/measure-web-vitals.ts` merged
automatically; only this file conflicted. Re-gated after the merge (numbers in the PR).

### Performance P3: client payload and network — 2026-09-17

Codex implemented P3 on branch `codex/perf-client-network` in worktree
`/Users/amitsharma/Projects/distil-codex-perf-client-network`, based on fresh `origin/main`
`58a4a9c` (later than the requested floor because it records the P6 release). Implementation commit
`8627ab3`; verified PR-opening head `25d5a01`. PR
[#32](https://github.com/amitsharmaak/distil/pull/32) is open against `main` with the `full-ci`
label. Nothing was merged or deployed; Production, Neon, Vercel, migrations, environment
variables and the release pin were not touched. The P6 capture path, `src/lib/ai/**`,
`src/proxy.ts` and `src/lib/auth/neon-proxy.ts` were not edited.

**What changed**

- Every client fetch now uses a same-origin relative `/api/...` URL. New
  `src/lib/public-config.ts` is the only browser-safe configuration surface and exports only
  `apiBaseUrl`; no client component imports `src/lib/config.ts`. A production-build scan found no
  server configuration field names or API-base literal in `.next/static/chunks`.
- Legacy `GET /api/items` defaults to `limit=100`. New tenant-bound
  `GET /api/v1/items/status?ids=` accepts 1–50 ids and returns only `{ id, processingStatus }`
  projections visible through the caller's tenant repository; foreign/missing ids are omitted.
  The authorization matrix, frozen route inventory and reviewed route count now cover 82 API
  files and 18 pages.
- `/feed` keeps server filters authoritative (only the rejected guard remains), polls the status
  projection every three seconds only while processing ids exist, and patches the matching rows.
  A component test advances the interval and proves no second `/api/v1/feed` request occurs.
- Today now makes one
  `/api/v1/feed?sort=priority&read=false&limit=6&resurface=stale` request. The route returns the
  priority page plus `resurfacedItems` selected inside the same tenant transaction; PostgreSQL
  enforces unread, unarchived, ready, `last_opened_at` present and at least 14 days old. The old
  100-item Today scan and client filtering are gone.
- Next client-cache TTLs are `staleTimes: { dynamic: 30, static: 300 }`. Mark-read, lazy extract
  and profile updates apply local state first; success performs no `router.refresh()`, while a
  failed update rolls back where applicable and refreshes. P2/P4 work was retained: summary feed
  rows still exclude `thumbnailUrl`, and the P4 compiler/import optimizations remain enabled.
- `scripts/perf/measure-web-vitals.ts` now builds for relative same-origin requests and records a
  processing-feed sample across one polling interval in addition to the existing pages.

**Before / after (local production build, Docker PostgreSQL, medians of five runs unless noted)**

| Page                             | Requests before | Requests after | Transfer before | Transfer after |
| -------------------------------- | --------------: | -------------: | --------------: | -------------: |
| `/`                              |              41 |             40 |          490 kB |         480 kB |
| `/feed`                          |              45 |             45 |          480 kB |         479 kB |
| `/feed` with one processing item |              45 |             45 |          487 kB |         479 kB |

The processing total stays at 45 because a non-clickable processing card removes one reader-link
prefetch while one poll is added. Before P3 that poll was another full `GET /api/v1/feed`; after
P3 the measured request is only `GET /api/v1/items/status`. The component proof additionally
asserts the full feed request count does not increase after the interval. Baseline processing
numbers use three runs on an otherwise clean detached `58a4a9c`; the ordinary baseline and all
after numbers use five runs. Final output:
`.perf/web-vitals-2026-09-17T15-25-59-313Z.json` (gitignored).

**Client bundle (`npm run build && npm run perf:bundle -- --fail-on-growth=0`)**

| Route                 | `58a4a9c` gzip |  P3 gzip |   Delta |
| --------------------- | -------------: | -------: | ------: |
| `/`                   |       140.4 kB | 139.8 kB | -0.6 kB |
| `/feed`               |       171.2 kB | 169.3 kB | -1.9 kB |
| shared by every route |       132.8 kB | 132.8 kB |       0 |

The required client-bundle delta is therefore non-positive. The committed P0 comparison also
remains negative for every extant route; the no-growth command exited 0.

**Locally verified**

- `npm run check`: ESLint 0 errors / 5 existing warnings, formatting and TypeScript clean; Jest
  206 suites / 1,478 tests passed. This includes owner success, anonymous 401, foreign/missing-id
  omission and malformed-input coverage for the new status route, the 100-item legacy cap, the
  server stale filter and optimistic success/failure behavior.
- `npm run test:e2e`: 27 passed / 3 expected feature-flag skips across desktop Chromium, mobile
  Chromium and mobile WebKit. Updated Phase 2 feed mocks return both response projections.
- Production build succeeded with the new route and `staleTimes`; the bundle command above and
  `npm run perf:vitals` both passed. Deterministic tests and measurements used local resources and
  contacted no hosted service.

**Unfinished / exact restart:** PR #32 is open with `full-ci`; its Quick gate and Vercel check had
started when this checkpoint closed. Amit decides merge and release. Inspect the PR checks, review
the diff and merge only on Amit's instruction. After a later merge, re-check the resulting `main`
Quick/Full gates and Vercel deployment before calling P3 deployed.

### Performance P6 released — 2026-09-17

Amit squash-merged PR [#30](https://github.com/amitsharmaak/distil/pull/30) (`codex/perf-ai`,
head `b992bed`) as `637d923` at 14:51 UTC, after the Quick gate and every `full-ci` Full gate
job passed on that head; the post-merge Quick gate on `main` also passed. With the release pin
`unpinned`, Vercel deployed it automatically as GitHub deployment `6505511035` (`success`);
`https://distilai.app/api/health` returned 200. Codex's worktree
`/Users/amitsharma/Projects/distil-codex-perf-ai` and the branch are gone; no PR is open. No
migration, environment-variable, release-pin or Neon change; the legacy alias
`distil-pv-1850.vercel.app` still points at the P1 release. This checkpoint corrects the P6
checkpoint below, which was written while the PR was still open.

**Not yet verified on Production:** P6 is the first release that makes a model call on every
capture (`FEATURE_CAPTURE_SUMMARY`, on by default; no Production variable was set). The
Production library is still empty, so the live capture-summary path, the `after()` accounting
writes under Vercel's request lifetime, and the Gemini timeout/ceiling have only Codex's local
and deterministic evidence. Handoff next step 3 names the single capture that closes this.

**Rollback:** set `FEATURE_CAPTURE_SUMMARY=false` in Vercel (kill switch, no redeploy of code
needed beyond the env change) to stop per-capture summaries; or revert `637d923` on `main`
(auto-deploys) / promote deployment `6505192777` (`eb557a7`). No schema changed.

### Performance P6: AI cost and latency — 2026-09-17

Codex implemented P6 on branch `codex/perf-ai` in worktree
`/Users/amitsharma/Projects/distil-codex-perf-ai`, started from `origin/main` `c85f336` and synced
with `origin/main` `eb557a7` by merge, never rebase. Implementation commit: `2979d1a`. The PR is not
merged or deployed. PR [#30](https://github.com/amitsharmaak/distil/pull/30) is open with the
`full-ci` label. Production, Neon, Vercel, environment variables, release pin and migrations were
not touched.

- **Capture summary:** the shared `consumeCaptureMessage` enrichment hook now indexes first and
  then requests one tenant-budget-admitted `brief` summary. This is identical for Vercel Queue and
  `DISTIL_CAPTURE_DISPATCH=inline`. `FEATURE_CAPTURE_SUMMARY` is on unless its normalized value is
  exactly `false`; summary/provider failures log `capture_summary_skipped` without failing an
  accepted capture. Existing summary cache hits and normalized-URL dedupe perform no model call.
- **Model-call and retrieval diet:** semantic search checks tenant embedding count before asking a
  provider for a query embedding and reads at most 500 recent embeddings. Legacy RAG greetings are
  deterministic and model-free. Grounded `/api/v1/answers` caches a validated answer for 24 hours
  by tenant user id, normalized question and ordered passage-id hash; the cache is bounded to 512
  process-local entries and never shares across tenants. No cross-tenant article cache was added.
- **Latency and accounting:** tenant AI calls still perform one budget admission before the model,
  then return without awaiting audit-log and `ai.usage` persistence; Next `after()` keeps both
  writes alive after the response. Direct tests and the long-lived local inline worker use a safe
  microtask fallback outside a Next request scope. Usage counters now use a lock-free
  `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` with the quota limit in the conflict predicate;
  the concurrent PostgreSQL quota proof remains green.
- **Provider and summary bounds:** Gemini text generation now always supplies a 15-second default
  timeout and 4,096-token output ceiling; all providers return their measured input/output usage
  to the router. Sonnet requests place `cache_control: { type: "ephemeral" }` on their stable system
  preamble (verified against the installed Anthropic SDK types and current official prompt-cache
  documentation because the requested `claude-api` skill was not installed). Long summaries use
  `p-limit(3)` plus `Promise.all`; forced regeneration observes a persisted 60-second per-item and
  prompt-length cooldown. P7's content-hash column does not exist yet, so P6 does not key on it.

Before/after numbers (deterministic local evidence, not hosted-provider timing):

| Surface                                    | Before                                                  | After                                                                                       |
| ------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| New capture, normal provider path          | 0 generated brief calls                                 | 1 flash-lite brief call; cache/replay/dedupe 0; provider fallback can add one bounded retry |
| Conversational legacy RAG answer           | 1 model call                                            | 0 model calls                                                                               |
| Grounded answer                            | 1 call per request                                      | 1 on cache miss, 0 on a same-tenant 24-hour cache hit                                       |
| Semantic query with zero stored embeddings | 1 embedding-provider call attempted                     | 0 provider calls after one count query                                                      |
| Post-model critical path                   | 2 awaited durable writes in sequence (audit then usage) | 0 awaited durable writes; both run in parallel under `after()`                              |
| Token accounting proof fixture             | estimated from characters (2 input / 2 output)          | provider-returned 123 input / 45 output; estimate is only a missing-metadata fallback       |
| Long-summary chunk concurrency             | 1 serial call                                           | maximum 3 concurrent calls                                                                  |

- **Locally verified:** `npm run check` passed with lint 0 errors / 6 pre-existing warnings,
  Prettier clean, TypeScript clean, and 204 suites / 1,465 tests passed. `npm run test:integration`
  passed against Docker PostgreSQL 29.7.2: 12 suites / 45 tests. Focused P6 run: 12 suites / 162
  tests before the full gate. No live provider, hosted latency, deployment or Production smoke was
  run, so implementation is complete and locally verified but not deployed.
- **Unfinished / restart:** wait for the Quick gate, Vercel and every `full-ci` job on PR #30.
  Review, merge and release wait for Amit's instruction.

### Performance P2 released — 2026-09-17

PR [#26](https://github.com/amitsharmaak/distil/pull/26) merged as `a06d0d7` and auto-deployed
(GitHub deployment `6499150136`); the docs-only `c85f336` (#28) redeployed identical application
code as `6499256635`, which served the reading below. Merge and gates are recorded in "PR review,
merges and cleanup — 2026-09-17". No environment variable, migration or Neon resource changed;
the legacy alias `distil-pv-1850.vercel.app` still points at the P1 release.

**Live verification (Production `c85f336`, hosted Neon Auth, Amit's signed-in session in the
in-app browser, 2026-09-17, `Server-Timing` read through same-origin `fetch`, second of two
readings per route; library empty, so `db` costs are the floor of each query shape)**

| Request                   | Proxy provider      | Proxy auth query | Proxy total             | Route `auth` | Route `db` (P1 → P2)                        |
| ------------------------- | ------------------- | ---------------- | ----------------------- | ------------ | ------------------------------------------- |
| `GET /api/v1/feed`        | 128.7 ms, `calls=1` | 128.9 ms, `q=1`  | 260.1 ms, `calls=1 q=1` | 0.7 ms       | 45.9 ms `q=7 tx=2` → **19.2 ms `q=3 tx=1`** |
| `GET /api/v1/collections` | 81.5 ms, `calls=1`  | 128.2 ms, `q=1`  | 211.1 ms, `calls=1 q=1` | 1.8 ms       | 18.0 ms `q=3 tx=1` → **10.8 ms `q=2 tx=1`** |
| `GET /feed` (page)        | 82.5 ms, `calls=1`  | 128.7 ms, `q=1`  | 212.3 ms, `calls=1 q=1` | n/a          | n/a                                         |

The feed's first (cold) reading was `db;dur=21.7` with the same `q=3 tx=1`, collections
`db;dur=18.0` then `10.8`. The statement and transaction counts match the local P2 checkpoint
exactly (feed 7 → 3 statements, 2 → 1 transactions with personalization on; collections 3 → 2).
The proxy phases are unchanged from P1 (one provider call, one auth query of about 128 ms), as
P2 did not touch `src/proxy.ts` or `neon-proxy.ts`; that query remains the largest fixed cost per
request and is P7's target. The item-state route (`q=3 tx=1` → `q=2 tx=1` locally) could not be
read because the Production library has no item; take it after the first capture. The
`/api/v1/feed` response carried `items: []`, so the summary-projection payload saving is not
visible on Production yet either.

**Rollback**: revert `a06d0d7` on `main` (auto-deploys) or promote deployment `6499086682`
(`0d5e689`) in Vercel; no schema changed.

### PR review, merges and cleanup — 2026-09-17

Integration pass on branch `claude/pr-review-merge-cleanup-5175d4` (worktree
`.claude/worktrees/pr-review-merge-cleanup-5175d4`), at Amit's request to review and merge every
open PR so the next task (P6 on Codex) starts from a clean `main`. Claude acted as integration
owner per `AGENTS.md` §7; every merge was a squash through GitHub with the required
`quality-gate` and `Vercel` checks green on the up-to-date head.

- **PR [#25](https://github.com/amitsharmaak/distil/pull/25)** (Codex, docs-only, P4 release
  state): reviewed against the actual state (P4 merged as `f295124`, deployment `6498811802`);
  merged first as `9f0caf6`.
- **PR [#27](https://github.com/amitsharmaak/distil/pull/27)** (local development loop): code
  reviewed — the queue worker wiring moved verbatim into `src/lib/queue/capture-consumer.ts`,
  `InlineCaptureDispatcher` defers a `structuredClone` of the message and routes failures to the
  error hook, `scripts/local-db-reset.ts` refuses non-loopback hosts, and the Vercel path is
  unchanged by default. `origin/main` (#25) merged in; only `docs/project-state.md` conflicted
  and both checkpoints were kept. Quick gate and every Full gate job (deterministic tests,
  PostgreSQL integration, production build, web/mobile E2E, extension E2E, coverage) passed on
  head `8eefc54`; merged as `0d5e689`.
- **PR [#26](https://github.com/amitsharmaak/distil/pull/26)** (P2): had never run CI because it
  conflicted with `main` (GitHub skips `pull_request` workflows on conflicting PRs). Code
  reviewed: the one-statement tenant verification keeps the six-way `current_setting` proof and
  fails closed; `withTenantRepositories` binds one transaction with nested `begin` as savepoints;
  `findNeighbours` matches the default `list()` order (ready-only, `created_at DESC`, id
  tie-break); the summary projection drops only fields no list surface reads (`tsc` proves it).
  Noted, not changed: `items.list()` now defaults to 200 rows, so `reprioritize`
  (`/api/ai/prioritize`, `/api/ai/feedback`) and the legacy `GET /api/items` without `limit`
  score or return at most the 200 newest ready items — documented in the P2 checkpoint as
  deliberate. `origin/main` merged in twice (after #25 and after #27); code merged
  automatically with P4's deletions and the local loop, only the state file conflicted. Local
  gates on the combined tree: `npm run check` (lint 0 errors / 6 warnings, Prettier clean,
  `tsc` clean, 201 suites / 1455 tests) and `npm run test:integration` (Docker, 12 suites / 45
  tests). Quick gate and every Full gate job passed on head `48906b2`; merged as `a06d0d7`.
- **Release (automatic, pin `unpinned`):** each merge auto-deployed. Production serves
  `a06d0d7` as GitHub deployment `6499150136` (`success`); `https://distilai.app/api/health`
  returned 200 with `cache-control: no-store`. The legacy alias `distil-pv-1850.vercel.app` was
  not re-aliased (still the P1 release). No manual deploy, migration or environment change. The
  P2 Production `Server-Timing` reading is still to be taken.
- **Cleanup:** removed the merged worktrees `perf-auth-handoff-b58c37` (#23),
  `perf-baseline-627eff` (#21), `perf-db-roundtrips-2118ba` (#26), `distil-urls-config-4d6132`
  (#27) and `/private/tmp/distil-perf-bundle` (#24/#25), and the local branches
  `claude/branch-workflow`, `claude/perf-baseline-627eff`, `claude/perf-p1-release-record`,
  `claude/perf-auth-handoff-b58c37`, `codex/perf-bundle`, `codex/perf-bundle-release-state`,
  `claude/distil-urls-config-4d6132`, `claude/perf-db-roundtrips` — each verified clean and
  tree-identical to its squash commit first. The main checkout was on the merged
  `claude/branch-workflow`; it is back on `main` at `a06d0d7`. Remote branches were auto-deleted.
  Left alone: `.claude/worktrees/jabra-evolve-mic-test-7167d1` (clean, no commits, not a Distil
  task; Amit decides).
- **Handoff edits:** the "Performance overhaul", "Owner", "Branch / worktree" and "Local
  iteration loop" bullets and next step 3 were rewritten to the post-merge state; a resolution
  artifact that had spliced the local-loop bullet into the middle of the branch bullet was
  untangled. The P6 file:line pointers in next step 3 were re-verified on `a06d0d7`.

### Performance P2: database round-trip diet — 2026-09-17

Phase P2 of the performance plan, branch `claude/perf-db-roundtrips` (Claude Code worktree
`.claude/worktrees/perf-db-roundtrips-2118ba`, based on `origin/main` at `53edd84`, the P1
release record). Implementation commit `43f0cb4`; this state-file update follows on the same
branch. Executed with three Claude Code sub-agents on disjoint file sets (infrastructure, data
layer, adoption) and verified as one tree afterwards. Every file:line reference in the P2 brief was
re-checked against `53edd84` before editing: the chunk-metadata query cited at
`repositories.ts:1117` was still `listForContentVersion` at that line, the claims N+1 at
`repositories.ts:1434`, the preferences advisory lock at `postgres-store.ts:88`, and the reader's
library scan at `page.tsx:185`; P1 had already introduced `getPostgresClient()` in `database.ts`
and the auth-only adapter in `repository-runtime.ts`, so the "five separate pools" finding was
already down to two (runtime, control plane). No open PR touched the feed, feed-query or types
files when the branch started (`gh pr list` empty). Nothing was deployed; no environment
variable, migration or Production resource changed; no migration was added (the P7 index
migration stays a separate approval). Amit's decisions stand: no cross-tenant article cache; the
tenant verification invariant (set_config then current_setting proving the bound user) is kept,
folded into one round trip.

**What changed**

- `src/lib/postgres/client.ts`: `getSharedPostgresClient(url, options?)` memoises one
  postgres.js client per URL in a `Map` on `globalThis` (`Symbol.for("distil.postgres.clients")`)
  so the pool survives dev-server module reloads; `createPostgresClient` and
  `closePostgresClient` are unchanged for scripts. `src/lib/database.ts` drops its module-level
  client promise and resolves the runtime client (`DATABASE_URL`) and the control-plane client
  (`DATABASE_CONTROL_PLANE_URL`, still separate) through it; it also exports
  `withTenantRepositories(context, operation)`. `src/lib/auth/repository-runtime.ts` keeps
  building only the auth adapter on `getPostgresClient()` (now the globalThis memo).
- `src/lib/postgres/tenant-repositories.ts`: the tenant transaction now sends ONE statement,
  `WITH applied AS (SELECT set_config('app.user_id', …, true) …, set_config('search_path', …,
true)) SELECT nullif(current_setting('app.user_id', true), '') AS user_id, … FROM applied`,
  and the outer SELECT reads back only through `current_setting`, so the six-way mismatch check
  and the "Failed to establish transaction-local tenant context" failure are unchanged (set_config
  is volatile, so the CTE is materialised before the outer SELECT; the PostgreSQL integration
  suites prove it). New `withTenantRepositories(sql, context, operation)` opens one tenant
  transaction, binds `createPostgresRepositories` once on the proxied transaction, and keeps
  nested `begin` calls (advisory-locked writers) as savepoints; exposed on
  `PostgresRepositoryAccess`. `getTenantRepositories` (one transaction per call) is unchanged for
  every other caller. `bindRepositorySet` enumerates repository keys from a per-client cached
  unbound set instead of rebuilding 30 objects per call.
- Projection diet (`src/lib/types.ts`, `src/lib/postgres/mappers.ts`, new
  `src/lib/postgres/item-columns.ts`, `src/lib/postgres/repositories.ts`,
  `src/lib/feed/feed-query.ts`, `src/lib/repositories/ports.ts`): additive
  `ContentItemSummary` (`ContentItem` without `fullContent`, `extractedLinks`, `detectedMedia`,
  `contentClassification`, `thumbnailUrl`) and `mapItemSummary`; every items query now names its
  columns (no `i.*`, never `search_vector`); `items.listSummaries(filters)`;
  `items.findNeighbours(itemId, { unreadOnly })` as two keyset `LIMIT 1` queries on
  `(created_at, id)` over ready items; `list()` remains and defaults to 200 rows instead of
  1,000,000; `FeedItem = ContentItemSummary & { rank }`, so `/api/v1/feed` payloads no longer
  carry article bodies (`/` fell from 509 to 458 kB transferred, `/feed` from 477 to 452 kB).
  `src/components/**` were not edited: the Today and library components read only fields that
  remain on `FeedItem` (verified by `tsc`).
- `src/lib/digests/postgres-store.ts`: `getPreferences` is a plain `SELECT`; only the first-ever
  read for a user (no row) enters the existing advisory-locked insert path. Writers still lock.
- `src/lib/postgres/repositories.ts`: chunk queries use an explicit column list without
  `search_vector`; new `contentChunks.listMetadataForContentVersion` (neither `content` nor
  `search_vector`; `ContentChunkMetadata` added to `src/lib/knowledge/types.ts`) feeds the
  intelligence envelope, which never needed chunk text; `claims.listForArtifact` fetches all
  evidence in one `WHERE claim_id = ANY($1)` statement and groups in memory (zero claims → no
  evidence query).
- Adoption: `GET /api/v1/feed` runs preferences and the feed page inside one
  `withTenantRepositories` transaction; `/feed/[id]` loads `findById`, then `Promise.all` of
  summaries, feedback and `findNeighbours(item.id, { unreadOnly: filter !== "all" })` in one
  transaction, replacing the full-library scan and in-memory prev/next;
  `getItemIntelligence` runs its independent reads in two parallel waves;
  `reader-service.ts` parallelises the independent reads in `putNote`, `createAnnotation`,
  `annotationForItem` and `addCollectionItem` (item 404 still wins; `updateItemState` stays
  sequential). The `/api/v1/items/[id]/intelligence` route and the seven reader routes were not
  edited (outside the P2 ownership list); they benefit from the one-statement verification only.
- Tests: `tenant-repositories.unit` (combined statement in `queries[0]`, fail-closed mismatch,
  one `begin` for three reads, nested savepoint, mismatch through the access object),
  `client.unit` (per-URL memo survives `jest.resetModules()`), `database.unit`
  (`getSharedPostgresClient` mock, `withTenantRepositories` delegation), `repositories.unit` and
  `repositories.integration` (`listSummaries` without `fullContent`, `findNeighbours` newer/older,
  `unreadOnly`, missing id → nulls, `LIMIT 1` twice), `mappers.unit`, `feed-query.unit` (issued
  SQL contains no `full_content`, `extracted_links`, `detected_media`, `content_classification`,
  `thumbnail_url` or `search_vector`; items lack `fullContent`), `postgres-store.unit` (present
  row = one statement, no lock, no `begin`), `page.component` (uses `findNeighbours`, asserts the
  `unreadOnly` flag per filter and that ids reach navigation and the action bar),
  `service.unit` (metadata method used, first-wave reads in flight together),
  `reader-service.unit` (concurrent reads, 404 precedence), `route.contract` (feed route calls
  `withTenantRepositories` once), `phase2-reader-api.security.unit` (mock gains
  `withTenantRepositories`), `jobs.unit` (typed fake gains the new chunk method).
  `tests/security/phase3-boundaries.integration.test.ts` needed no change: its fakes record the
  set_config values and answer the current_setting read on the same combined statement.
  `tests/security/phase3-rls.integration.test.ts` is unchanged and remains the real RLS proof.
- `tests/perf/round-trips.unit.test.ts` lowered: `GET /api/v1/feed` is one transaction and
  three statements (verification, preferences, feed) with the tenant verification asserted to be
  a single statement containing both `set_config('app.user_id'` and
  `current_setting('app.user_id'`; a personalization-off case pins `q=2 tx=1`; the proxy fence
  stays `calls=1 q=1`. The test's `sqlDouble` is now lazy like postgres.js (a tagged template
  counts only when awaited) and stubs `sql.unsafe`, so spliced fragments are not miscounted.

**Deviations from the brief, deliberate**

- `listForContentVersion` keeps `content` (the intelligence runtime reads chunk text for
  summaries and claims); only `search_vector` was dropped there, and the metadata-only shape the
  brief wanted for the envelope is the new `listMetadataForContentVersion`.
- Static column lists are spliced with `sql.unsafe(...)` from module-owned constants
  (`item-columns.ts`), never from caller input; the alternative of listing 24 columns inline in
  every template was rejected for drift risk. `user_id` is not in the item column lists because no
  mapper reads it and the legacy repository integration harness has no such column.
- Files outside the P2 ownership list that changed, all additive: `src/lib/repositories/ports.ts`
  (three interface members), `src/lib/knowledge/types.ts` (one type),
  `src/lib/digests/postgres-store.ts` (named by the brief), `src/lib/knowledge/__tests__/jobs.unit.test.ts`
  (typed fake). `docs/authorization-matrix.json` is unchanged (no route added or removed).

**Before → after: request cost (`tests/perf/round-trips.unit.test.ts`, Neon Auth path)**

| Request                                        | Provider calls | Auth queries | Transactions | Statements |
| ---------------------------------------------- | -------------- | ------------ | ------------ | ---------- |
| Proxy, authenticated GET (any path)            | 1              | 1            | 0            | 1          |
| `GET /api/v1/feed` route (personalization on)  | 0              | 0            | 2 → **1**    | 7 → **3**  |
| `GET /api/v1/feed` route (personalization off) | 0              | 0            | **1**        | **2**      |
| Total per `/api/v1/feed` request               | 1              | 1            | 2 → **1**    | 8 → **4**  |

**Server-Timing under `next start` (`perf:vitals`, legacy session bridge, local PostgreSQL, so
`auth` is cookie verification on both sides; P0 → P1 → P2)**

| Request                        | P0                            | P1                            | P2                                        |
| ------------------------------ | ----------------------------- | ----------------------------- | ----------------------------------------- |
| `GET /api/v1/feed`             | `db;dur=21.9;desc="q=7 tx=2"` | `db;dur=20.3;desc="q=7 tx=2"` | `db;dur=16.1;desc="q=3 tx=1"` (2nd: 11.9) |
| `GET /api/v1/collections`      | `db≈7.5ms q=3 tx=1`           | not recorded                  | `db;dur=5.5;desc="q=2 tx=1"` (2nd: 6.8)   |
| `GET /api/v1/items/[id]/state` | `db≈9ms q=3 tx=1`             | not recorded                  | `db;dur=8.5;desc="q=2 tx=1"`              |

For comparison, the live P1 numbers on Production (Neon, `sin1`) were `db;dur=45.9;desc="q=7
tx=2"` for the feed and `db;dur=18.0;desc="q=3 tx=1"` for collections; P2 removes one full
round trip from every tenant transaction and one transaction plus three statements from the feed
route, which matters more on Neon's ~5-10 ms round trips than on the local socket measured here.
The Production before/after can only be read after Amit releases this phase.

**Note for P7 (`distil_resolve_auth_identity`, about 130 ms live per the P1 release
checkpoint):** P2 does not change it. The proxy still costs exactly one auth query
(`proxy-auth-db;desc="q=1"` in the fence), it runs outside any tenant transaction, and it already
used the shared runtime client since P1; the only P2 effect is that the pool behind it now
survives module reloads. Its latency is dominated by the function itself and the Neon round
trip, so P7 should look at the function's plan and indexes on `auth_identities`/`users`, not at
transaction shape.

**Client JavaScript (`npm run perf:bundle`, Turbopack production build of `43f0cb4`)**: zero gzip
delta on every route against `docs/perf/route-bundle-stats.baseline.json`.

**Page-load medians (`npm run perf:vitals`, 5 runs, 12 seeded items, Chromium 1440×900, build with
`NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3100`, Docker `postgres:16-alpine`, legacy bridge;
P1 → P2)**

| Page         | TTFB     | FCP        | LCP          | Requests | Transferred      |
| ------------ | -------- | ---------- | ------------ | -------- | ---------------- |
| `/`          | 8 → 8 ms | 28 → 28 ms | 100 → 100 ms | 43 → 43  | 510 → **458 kB** |
| `/feed`      | 4 → 3 ms | 24 → 24 ms | 100 → 92 ms  | 47 → 47  | 478 → **452 kB** |
| `/feed/[id]` | 8 → 8 ms | 32 → 32 ms | 32 → 32 ms   | 40 → 40  | 569 → 569 kB     |
| `/settings`  | 3 → 3 ms | 28 → 24 ms | 28 → 28 ms   | 29 → 29  | 426 → 426 kB     |

Timings are within run-to-run noise on the local socket; the transferred-byte drop on `/` and
`/feed` is the summary projection.

**Verification (all locally verified 2026-09-17 on `43f0cb4`)**

- `npm run check`: ESLint 0 errors / 10 baseline warnings, Prettier clean, `tsc --noEmit` clean,
  Jest 205 suites / 1506 tests passed (P1: 205 / 1486).
- `npm run test:integration` (Docker PostgreSQL via Testcontainers): 12 suites / 45 tests passed
  (P1: 44; the new case is `findNeighbours`/`listSummaries`).
- `npm run build` (default env) succeeded; `npm run perf:bundle` zero delta. Second build with
  `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3100` succeeded; `npm run perf:vitals` completed, all
  four pages 200 without redirecting.
- Not run locally: E2E and extension Playwright (CI "Full gate" runs them on the `full-ci` label
  the PR carries, as the plan requires for P2).
- Previously recorded external state, not re-checked: Production serving `f2e4155`, the release
  pin `unpinned`, Neon branches, the nightly Full gate.

**Risks and rollback**: per-file revert; the projection is additive while `list()` remains, and
`getTenantRepositories` still exists for every caller that was not moved. If a Production request
ever fails with "Failed to establish transaction-local tenant context", the combined statement did
not apply the settings before reading them back (it would fail closed, never leak); revert
`tenant-repositories.ts` alone to restore the two-statement form.

**Restart steps**: `git fetch origin && git switch claude/perf-db-roundtrips` in its worktree;
`npm ci`; `npm run check`; `npm run test:integration` (Docker); for numbers `npm run build && npm
run perf:bundle` and `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3100 npm run build && npm run
perf:vitals` (free port 3100). If Codex's P4 merges first: `git merge origin/main` (never rebase)
and rerun `npm run check`; the `neon-proxy.ts` CSRF digest is untouched by P2.

### Local development loop — 2026-09-17

Branch `claude/distil-urls-config-4d6132`. Goal: iterate on the UI and capture behaviour entirely on
a laptop, with a database that can be wiped at will and no Vercel deploy per fix.

- **Local PostgreSQL:** `docker-compose.yml` (project `distil-local`, `postgres:16-alpine` on
  port 5433, owner `distil`, database `distil_local`). `npm run dev:local` starts it and then
  `next dev`; `npm run db:local:down` stops it.
- **Reset:** `scripts/local-db-reset.ts` (`npm run db:local:reset`) drops `public` and
  `tenant_api`, re-applies the four base migrations, `phase3_roles.sql`, the five tenant stages
  (expand → baseline → backfill → contract → lifecycle → returning-auth) with
  `DISTIL_LEGACY_USER_ID` as owner, creates the `distil_app` login role (member of
  `distil_runtime`), and activates the owner user. It refuses non-loopback hosts.
- **In-process capture:** `DISTIL_CAPTURE_DISPATCH=inline` selects the new
  `InlineCaptureDispatcher` (`src/lib/queue/dispatchers.ts`) in `src/lib/capture/composition.ts`.
  The queue callback's worker wiring moved to `src/lib/queue/capture-consumer.ts` and is shared
  by the Vercel route and the inline path, so both run the same worker, processor and knowledge
  indexing. Default remains the Vercel queue; the flag is local-only.
- **Secrets helper:** `npm run local:secrets -- <password>` prints `DISTIL_LEGACY_USER_ID`,
  `DISTIL_SESSION_SECRET` and `DISTIL_WEB_PASSWORD_HASH`. The hash is emitted with `\$` escapes
  because `@next/env` expands `$name` even inside single quotes (verified: an unescaped hash
  collapses to 32 characters and every login returns 401).
- **Auth locally:** `FEATURE_NEON_AUTH=false`, legacy password login only. Phase 2 experience
  flags are set to `true` in `.env.local.example` so the full app renders.
- **Docs:** `.env.local.example` (new), `docs/runbooks/local-development.md` (new), README
  "Running locally" rewritten, AGENTS.md command list extended.
- **Tests:** `InlineCaptureDispatcher` unit tests (deferred execution, detached copy, error hook)
  and composition tests for the default and inline selection. Existing queue route contract tests
  unchanged and passing.
- **Verified locally (2026-09-17):** fresh reset, `npm run dev:local`, password login, saving
  `https://paulgraham.com/greatwork.html` from `/save` returned 202, the capture request row went
  `queued → ready` in about two seconds through the inline worker, and "How to Do Great Work"
  appeared in the Feed. Not verified: the browser extension against localhost (Amit's step), and
  nothing was deployed.
- **Follow-ups:** a Neon dev branch is deliberately not part of this loop (Amit wants local data
  independent of Production). Tenant lifecycle jobs still have no local consumer.
- **Rebased 2026-09-17** onto `origin/main` at `f295124` (P0, P1, P4 merged). Only
  `docs/project-state.md` conflicted; the code merged cleanly and P4 did not touch the queue,
  capture or knowledge modules. After the rebase: `npm run check` passed (201 suites, 1435 tests;
  a stale `.next/dev/types` file from the earlier dev run had to be deleted first, it is not
  source). `npm run test:integration` passed (12 Testcontainers suites, 44 tests).
- **Note for P6 (`claude/perf-ai`):** the P6 brief edits the `enqueueEnrichment` hook "in
  `src/app/api/queue/capture-requests/route.ts`". That hook, the `CaptureWorker` construction and
  `createDefaultCaptureProcessor` wiring now live in `consumeCaptureMessage` in
  `src/lib/queue/capture-consumer.ts`; the route only keeps `handleCallback`, the message
  validation (`createCaptureQueueMessageHandler`) and the re-exported `CAPTURE_QUEUE_ACTOR_ID`.
  Put the per-capture brief summary call after `indexCapturedItem` inside that consumer so it
  runs identically behind Vercel Queue and behind the local inline dispatcher; the route contract
  test still mocks `@vercel/queue` and does not exercise the consumer. `composeCaptureRoutes` in
  `src/lib/capture/composition.ts` chooses the dispatcher from `config.captureDispatch`
  (`"queue"` default, `"inline"` local) and imports the consumer lazily so the request path
  never loads the worker on Vercel.

### Performance P4 released — 2026-09-17

Amit squash-merged PR [#24](https://github.com/amitsharmaak/distil/pull/24) as `f295124` while the
Codex handoff was in progress. Codex did not invoke the merge or a deployment. Because the release
pin remains `unpinned`, Vercel's Git integration then created Production deployment `6498811802`;
its status is `success`, and `https://distilai.app/api/health` returned 200 with
`cache-control: no-store`. The legacy alias was not re-aliased or re-checked. No migration or
environment-variable change occurred.

The PR's final head `1eef11f` passed the Quick gate and every labeled Full gate job: deterministic
tests, PostgreSQL integration, production build, web/mobile E2E, extension E2E and the non-blocking
coverage job. The post-merge Quick gate on `f295124` also passed. The implementation results and
the shared-bundle target deviation remain in the next checkpoint. This docs-only release-state
correction is branch `codex/perf-bundle-release-state`; merge its PR to make the canonical handoff
match the already-released external state.

### Performance P4: bundle and rendering — 2026-09-17

Phase P4 is implementation-complete on branch `codex/perf-bundle`, worktree
`/private/tmp/distil-perf-bundle`, based on `origin/main` at `53edd84` (P1 included).
Implementation commit `5578b7b`, documentation checkpoint `83c8b03`, PR
[#24](https://github.com/amitsharmaak/distil/pull/24) with the `full-ci` label. Nothing was
deployed to Production, no migration ran, no environment variable changed and no Production
resource was touched. The PR integration created automatic Vercel Preview deployment
`6498702959` after the branch was pushed.

**What changed**

- The reader page sanitizes article content on the server before crossing the client boundary.
  Client components render server-sanitized HTML or escaped plain text; a component test pins the
  latter. React Markdown, the AI-summary implementation, detail actions, Reader View overlay and
  authenticated app shell are split behind `next/dynamic`, removing `sanitize-html` and large
  reader-only UI graphs from first load.
- Root layout drops Geist Mono and the global tooltip graph. Its blocking head script reads only
  `localStorage.theme` and applies the `dark` class; the provider reads that class. A Playwright
  reload with stored dark mode had `dark` applied at the first recorded paint (24 ms), with no
  light flash.
- Next enables Radix import optimization, inline CSS and the React compiler, removes the serial
  build-worker override, and TypeScript targets ES2022. `babel-plugin-react-compiler` was added
  last and retained because both the production build and the full web E2E suite stayed green.
  Warm local build wall time was 7.66 s without the compiler and 15.83 s with it (first compiler
  build; 2.2 s compilation plus 11.1 s TypeScript validation).
- The sidebar uses the new 688-byte `logo.svg`; `logo.png` is 6.4 KB for the remaining login page.
  Re-encoded icons are 11.7/13.1/37.0 KB and the unused CRA SVG assets are gone.
- Deleted the unlinked `/sources`, `/topics` and `/research` pages, all
  `/api/ai/research/**` and `/api/agent/**` routes, their route-only UI/tests, the approved dead AI
  and agent modules, `src/lib/notifications.ts`, and the unmounted agent status panel. The
  authorization inventory and its frozen route surfaces now cover 81 API route files and 18 page
  files; the CSRF fixture digest remains unchanged because `src/lib/auth/neon-proxy.ts` was not
  edited. No cross-tenant cache was added.

**Bundle result (`npm run build && npm run perf:bundle`, committed P0 baseline → P4)**

| Route                 | P0 gzip  | P4 gzip  | Delta     |
| --------------------- | -------- | -------- | --------- |
| shared by every route | 169.3 KB | 132.8 KB | -36.5 KB  |
| `/`                   | 172.5 KB | 140.4 KB | -32.1 KB  |
| `/feed`               | 186.1 KB | 171.1 KB | -15.0 KB  |
| `/feed/[id]`          | 301.0 KB | 155.0 KB | -146.0 KB |
| `/settings`           | 175.6 KB | 155.0 KB | -20.6 KB  |

The `/feed/[id]` target (under 170 KB) is met. The shared target (under 120 KB) is not: inspection
of the final route stats attributes 130.7 KB gzip to the Next.js/React/Turbopack framework chunks
before the remaining Distil lazy shell. The phase stops at 132.8 KB rather than moving into
P3/P5-owned code or changing framework/runtime versions. The committed baseline file was not
regenerated.

**Vitals medians (`NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3100 npm run build && npm run
perf:vitals`, Docker PostgreSQL, one warm-up plus five runs; P0 → P4)**

| Page         | TTFB     | FCP        | LCP          | Requests | Transferred  |
| ------------ | -------- | ---------- | ------------ | -------- | ------------ |
| `/`          | 7 → 7 ms | 28 → 28 ms | 100 → 104 ms | 43 → 41  | 509 → 543 kB |
| `/feed`      | 3 → 5 ms | 24 → 24 ms | 96 → 104 ms  | 47 → 45  | 477 → 506 kB |
| `/feed/[id]` | 8 → 8 ms | 32 → 36 ms | 32 → 36 ms   | 40 → 40  | 568 → 511 kB |
| `/settings`  | 3 → 5 ms | 28 → 28 ms | 28 → 28 ms   | 29 → 27  | 425 → 456 kB |

Local timing differences are within one-run noise; requests fell by two on `/`, `/feed` and
`/settings`, while the reader transferred 57 KB less. The other transfer totals include changed
prefetch and inline-CSS behavior and are recorded without claiming an improvement.

**Locally verified**

- `npm run check`: ESLint 0 errors / 5 existing warnings; formatting and TypeScript clean; Jest
  201 suites / 1431 tests passed. This includes the tenancy, authorization-matrix and
  CSRF-boundary harnesses.
- `npm run test:e2e`: 27 passed / 3 feature-flag skips after the final dynamic-boundary refactor.
  `npm run test:extension`: 11 passed. Production builds succeeded both without and with the
  compiler; the compiler-on build produced the numbers above.
- `npm run perf:vitals`: all four measured pages returned 200 without redirects; output
  `.perf/web-vitals-2026-09-17T08-18-04-743Z.json`. Deterministic tests used fakes/local resources
  and did not contact hosted services.
- Externally verified after opening the PR: Quick gate and every Full gate job passed on
  `d3e5a24` (deterministic tests, PostgreSQL integration, production build, coverage, web/mobile
  E2E and extension E2E); Vercel Preview deployment `6498702959` passed. Previously recorded and
  not re-checked: Production at P1 release `f2e4155`, release pin `unpinned`, Neon resources and
  nightly CI. P4 is not merged or deployed to Production.

**Deviations and restart:** besides the shared-size exception above, deletion-dependent security
tests and frozen route-inventory expectations were removed or count-adjusted so the required
harnesses continue to prove every remaining surface. If review requests work, restart with
`git fetch origin && git switch codex/perf-bundle` in `/private/tmp/distil-perf-bundle`; if P2 or
another Claude PR merged first, run `git merge origin/main` (never rebase), resolve only this
checkpoint, then rerun `npm run check`, `npm run test:e2e`, `npm run build && npm run perf:bundle`.

### Performance P1 released — 2026-09-17

Amit approved "merge and release" in chat on 2026-09-17. PR
[#22](https://github.com/amitsharmaak/distil/pull/22) was squash-merged as `f2e4155` after every
check passed (Quick gate, Full gate: PostgreSQL integration, web/mobile E2E, extension E2E,
production build, coverage; Vercel preview). The Quick gate on `main` at `f2e4155` passed. With
the release pin `unpinned`, Vercel deployed the merge automatically as
`dpl_HMjgEvzutvgy3xZNxyBBHeAn65tJ` (GitHub deployment `6497949628` for `f2e4155`), aliased to
`distilai.app` by Vercel; Claude re-aliased `distil-pv-1850.vercel.app` to the same deployment
with `npx vercel alias set`. Both origins answer `GET /api/health` 200 with `cache-control:
no-store`. No environment variable, migration or Neon resource changed. The docs-only merge that
records this release auto-deploys again with identical application code; the legacy alias is
left on `dpl_HMjgEvzutvgy3xZNxyBBHeAn65tJ`.

**Live verification (Production, hosted Neon Auth, signed-in browser session, 2026-09-17,
`Server-Timing` read through same-origin `fetch`)**

| Request                   | Proxy provider      | Proxy auth query | Proxy total             | Route `auth` | Route `db`          |
| ------------------------- | ------------------- | ---------------- | ----------------------- | ------------ | ------------------- |
| `GET /api/v1/feed`        | 214.8 ms, `calls=1` | 132.5 ms, `q=1`  | 348.9 ms, `calls=1 q=1` | **0.6 ms**   | 45.9 ms, `q=7 tx=2` |
| `GET /api/v1/collections` | 112.1 ms, `calls=1` | 131.9 ms, `q=1`  | 245.4 ms, `calls=1 q=1` | **0.6 ms**   | 18.0 ms, `q=3 tx=1` |
| `GET /feed` (page)        | 99.7 ms, `calls=1`  | 133.0 ms, `q=1`  | 234.3 ms, `calls=1 q=1` | n/a          | n/a                 |

Before P1 the same requests showed `proxy-auth-provider;desc="calls=2"` and the route's own
`auth;desc="calls=1 q=1"` (P0 checkpoint), so each API request now makes one provider round trip
instead of three and one auth query instead of two, and the route's auth phase is the HMAC check
only. Observed and recorded, not acted on: the single remaining auth query
(`distil_resolve_auth_identity`) costs about 130 ms on Neon from `sin1`, more than the provider
call on two of three samples; the P2 (round-trip diet) and P7 (indexes) briefs should include it.
The `/api/health` route is public and carries no `Server-Timing` (unwrapped, as designed).

**Not verified by a person on this release**: signing in fresh, capture through the extension,
and the reader page. The signed-in session in the in-app browser continued to work across the
release without re-authentication, which is the expected behaviour of the unchanged provider
cookies.

**Rollback**: revert `f2e4155` on `main` (auto-deploys) or promote the previous deployment
`dpl_ECuAxAwWdqU1si3RcvVJP3RZSC8Q` (`f1cb2ac`) in Vercel; consumers fall back to full resolution, so either is safe.

### Performance P1: one auth verification per request — 2026-09-17

Phase P1 of the performance plan, branch `claude/perf-auth-handoff` (Claude Code worktree
`.claude/worktrees/perf-auth-handoff-b58c37`, based on `origin/main` at `f1cb2ac`, the P0 merge).
Implementation commit `f7f330b`; the state-file update follows on the same branch; PR
[#22](https://github.com/amitsharmaak/distil/pull/22). The `full-ci` label did not exist in the
repository yet (the tiering checkpoint assumed it); it was created on 2026-09-17 and applied. Every file:line reference in the P1 brief was re-checked
against `f1cb2ac` before editing: P0 had moved the proxy matcher to `src/proxy.ts:136` and the
eager repository await to line 88; everything else was where the brief said. Amit's decision
stands: exactly one uncached provider check per request, so a revoked session is rejected on the
next request; the signed session cookie is never trusted on its own. Nothing was deployed; no
environment variable, migration or Production resource changed.

**What changed**

- `src/lib/auth/neon-server.ts`: `verifyNeonSession(auth, request)` builds a synthetic
  `GET /api/auth/get-session?disableCookieCache=true` request carrying the inbound cookies (body
  headers stripped) and runs it through the SDK's public route handler, the same code path
  `src/app/api/auth/[...path]/route.ts` exposes (verified in the installed SDK:
  `handleAuthProxyRequest` skips its cookie cache for that parameter and mints the refreshed
  `session_data` cookie). The JSON body becomes the provider session; the `Set-Cookie` headers are
  returned for forwarding. No session-token cookie means no provider call at all.
  `getNeonProxyProvider()` exposes only `verifySession` to the proxy.
- `src/lib/auth/neon-proxy.ts`: `authorizeNeonProxy` no longer calls the SDK middleware. It checks
  the Origin allowlist first (unsafe methods), makes the single `verifySession` call, denies an
  empty session before any repository is loaded, feeds the session into the unchanged
  `resolveNeonAuthRequest` through a one-shot `{ getSession }` adapter, and replaces the four
  plain-text `x-distil-*` headers with one `x-distil-identity` token. Unauthenticated `/api/*`
  gets 401 JSON; unauthenticated pages get a 307 to `/sign-in` (previously the SDK's redirect);
  unmapped or inactive accounts keep 403 / `/access-denied`. Provider or database failures now
  propagate to the proxy's 503 instead of becoming a false 403. Repositories are a lazy
  `() => Promise<AuthRepositoryPort>`.
- `src/lib/auth/identity-token.ts` (new) and `src/lib/auth/hmac.ts` (new; the HMAC, base64url
  and constant-time helpers extracted from `session.ts`): HS256 claims
  `{ iss, sub, kind, sid?, fresh, jti: traceId, iat, exp: iat + 120 }`, key derived by SHA-256
  from a label plus `NEON_AUTH_COOKIE_SECRET` (else `DISTIL_SESSION_SECRET`) via the new
  `readAuthEnvironment().identityTokenSecret`, five seconds of clock skew, every rejection reported
  by category. The legacy session token is rejected even under the same secret.
- `src/proxy.ts`: strips every inbound `x-distil-*` and `x-trace-id` header before any branch by
  rebuilding the request with sanitized headers (public and specialized branches therefore return
  sanitized headers too); rate limiting runs before authentication for `/api/*`; the Neon branch
  passes `getAuthRepositoryPort` lazily so public paths never open the database; the matcher
  additionally excludes `robots.txt`, `sitemap.xml`, `logo.png`, `sw.js` and `*.svg` (compiled
  regexp checked in `.next/server/functions-config-manifest.json`; runtime stays `nodejs`). The
  three pinned literals are unchanged. Server-Timing keeps `proxy-auth-provider` (now the single
  `verifySession`) and `proxy-auth-db`.
- `src/lib/auth/account-service.ts`: `resolveRequestAuthContext` is wrapped in React `cache()`;
  a token whose `jti` equals the request's `x-trace-id` yields `createAuthContext` from the
  claims with zero I/O (user actors only); a missing token falls back silently to full resolution
  (queue routes, `POST /api/items`, capture tokens, direct invocation keep working); an invalid
  token is treated as absent and logged as `auth_handoff_rejected` with the rejection category and
  trace id, never the token. `resolveCurrentAccount` (lifecycle routes needing the account record
  and freshness) is unchanged and still resolves in full.
- `src/lib/auth/repository-runtime.ts` constructs only `new PostgresAuthRepository(sql)` on the
  shared client instead of the 30-repository set, memoized, with failures not cached.
  `src/lib/database.ts` gains `getPostgresClient()`: one memoized runtime-role client shared by
  every composition root (the control plane keeps its own second client), so the auth adapter no
  longer opens a separate pool.
- `src/lib/middleware/rate-limit.ts` prunes stale buckets only once the map exceeds 512 entries.
- `src/lib/auth/auth-metrics.ts` instruments `verifySession` and the lazy repository loader.
- Tests: `neon-proxy.security.unit.test.ts` rewritten around `verifySession` keeping every prior
  guarantee (public paths, unmapped and inactive accounts, lifecycle recovery, the 17 centrally
  protected mutations, dormant connector route, safe/specialized paths) and adding "exactly one
  provider call", "provider Set-Cookie forwarded" (also on denials) and trace binding; new
  `identity-token.security.unit.test.ts` (accepted, tampered payload and signature, wrong secret,
  expired at exactly 120 s, not-yet-valid, jti mismatch, missing, malformed, bad claims, legacy
  token, short secret); new `neon-session-verification.security.unit.test.ts` (the adapter sends
  `disableCookieCache=true` and the inbound cookies, forwards `Set-Cookie`, treats failures and
  empty bodies as unauthenticated); new `proxy-handoff.security.unit.test.ts` (inbound identity
  and trace headers stripped on public, specialized and page paths, forwarded token verifies with
  the forwarded trace id, 401/307 denials, 503 fail-closed, rate limit before auth);
  `account-service.unit.test.ts` adds accepted, missing, tampered, expired, jti-mismatch,
  malformed, unverifiable-secret and non-user cases with the log assertion; the
  `disableCookieCache` assertion stays in `request-context.security.unit.test.ts` for the route
  fallback path and is repeated for the adapter; `runtime-adapters.unit.test.ts` covers the
  shared-client adapter; `tests/fixtures/phase3/neon-csrf-boundary.json` sha256 refreshed
  (surfaces untouched); `tests/perf/round-trips.unit.test.ts` lowered.
- Not changed: `docs/authorization-matrix.json` (no route added or removed), every route file,
  `src/lib/auth/request-context.ts`, the legacy session bridge (it issues no token; its routes
  still verify the signed cookie, which is I/O-free).

**Before → after: request cost (`tests/perf/round-trips.unit.test.ts`, Neon Auth path)**

| Request                                       | Provider calls | Auth queries | Transactions | Statements |
| --------------------------------------------- | -------------- | ------------ | ------------ | ---------- |
| Proxy, authenticated GET (any path)           | 2 → **1**      | 1 → **1**    | 0            | 1          |
| `GET /api/v1/feed` route (personalization on) | 1 → **0**      | 1 → **0**    | 2            | 7          |
| Total per `/api/v1/feed` request              | 3 → **1**      | 2 → **1**    | 2            | 8          |
| Proxy, public path (`/api/health`)            | 0              | 0            | 0            | 0          |

A page render (`/feed/[id]`) goes from two provider calls plus one query to one plus one the same
way. Route-side `auth` on the Neon path is now one HMAC verification: `verifyIdentityToken`
measured with tsx on this Mac, 200 iterations, median 0.044 ms, p95 0.085 ms, max 0.96 ms, so the
route's `auth;dur=` entry is under one millisecond and carries no `calls=`/`q=` description.

**Server-Timing on `/api/v1/feed` under `next start` (perf:vitals, legacy session bridge and local
PostgreSQL, so `auth` is cookie verification on both sides and the Neon-path saving is not on this
measurement path):** P0 `proxy;dur=0.8, auth;dur=0.3, db;dur=21.9;desc="q=7 tx=2",
total;dur=22.4` → P1 `proxy;dur=2.2, auth;dur=0.6, db;dur=20.3;desc="q=7 tx=2", total;dur=21.0`
(second sample from `/feed`: `proxy;dur=0.6, auth;dur=0.9, db;dur=23.7, total;dur=24.8`). The
differences are run-to-run noise; `db` (P2's target) dominates and is unchanged. The Production
before/after for the Neon path (`proxy-auth-provider;desc="calls=1"` instead of `calls=2`, route
`auth` without `calls=1 q=1`) can only be read in DevTools after Amit releases this phase.

**Client JavaScript (`npm run perf:bundle`, Turbopack production build of `f7f330b`)**: zero gzip
delta on every route against `docs/perf/route-bundle-stats.baseline.json`, as expected for
server-only changes.

**Page-load medians (`npm run perf:vitals`, 5 runs, 12 seeded items, Chromium 1440×900, build
with `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3100`, Docker `postgres:16-alpine`, legacy bridge;
P0 → P1)**

| Page         | TTFB     | FCP        | LCP          | Requests | Transferred  |
| ------------ | -------- | ---------- | ------------ | -------- | ------------ |
| `/`          | 7 → 8 ms | 28 → 28 ms | 100 → 100 ms | 43 → 43  | 509 → 510 kB |
| `/feed`      | 3 → 4 ms | 24 → 24 ms | 96 → 100 ms  | 47 → 47  | 477 → 478 kB |
| `/feed/[id]` | 8 → 8 ms | 32 → 32 ms | 32 → 32 ms   | 40 → 40  | 568 → 569 kB |
| `/settings`  | 3 → 3 ms | 28 → 28 ms | 28 → 28 ms   | 29 → 29  | 425 → 426 kB |

Unchanged within noise, as expected: the vitals harness runs the legacy bridge, whose auth cost
was already sub-millisecond. The P1 gain is the removal of two hosted-provider round trips and one
Neon query per request in Production, which this local harness cannot show.

**Verification (all locally verified 2026-09-17 on `f7f330b` unless noted)**

- `npm run check`: ESLint 0 errors / 10 baseline warnings, Prettier clean, `tsc --noEmit` clean,
  Jest 205 suites / 1486 tests passed (P0: 202 / 1450).
- `npm run test:security`: 42 suites / 409 tests passed.
- `npm run test:integration` (Docker PostgreSQL via Testcontainers): 12 suites / 44 tests passed.
- `npm run build` (default env) succeeded; `npm run perf:bundle` zero delta. Second build with
  `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3100` succeeded; `npm run perf:vitals` completed, all
  four pages 200 without redirecting.
- Not run locally: E2E and extension Playwright (CI "Full gate" runs them on the `full-ci`
  label the PR carries). Not exercised locally: the hosted Neon Auth provider itself (no
  deterministic test contacts it); the SDK handler path was verified by reading the installed
  SDK source and by the adapter test with a fake handler.
- Previously recorded external state, not re-checked: Production serving `509fccc`, the release
  pin `unpinned`, Neon branches, the nightly Full gate.

**Risks and rollback**: revert the PR; every consumer falls back to full resolution automatically,
so a proxy-only revert is also safe. If a Production request ever logs `auth_handoff_rejected`
with `code: "trace_mismatch"` or `"expired"` at volume, a header or clock issue between the proxy
and the route runtime is the first suspect; the request still succeeds, only slower.

**Restart steps**: `git fetch origin && git switch claude/perf-auth-handoff` in its worktree;
`npm ci`; `npm run check`; for numbers `npm run build && npm run perf:bundle` and
`NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3100 npm run build && npm run perf:vitals` (Docker,
free port 3100). If Codex's P4 merges first: `git merge origin/main`, then refresh the sha256 in
`tests/fixtures/phase3/neon-csrf-boundary.json` only if `src/lib/auth/neon-proxy.ts` changed in
the merge (`shasum -a 256 src/lib/auth/neon-proxy.ts`), and rerun `npm run check`.

### Performance baseline (P0) — 2026-09-17

Phase P0 of the performance plan, branch `claude/perf-baseline-627eff` (Claude Code worktree
`.claude/worktrees/perf-baseline-627eff`, based on `origin/main` at `fa7dda5`). Implementation
commit `8d8de85`, PR [#21](https://github.com/amitsharmaak/distil/pull/21). No behaviour change:
the same provider calls, queries and transactions run as before; they are now counted and timed.
Every file:line reference in the P0 brief was re-checked against `fa7dda5` before editing and none
had moved. Nothing was deployed; no environment variable, migration or Production resource changed.

**What changed**

- `src/lib/observability/request-metrics.ts` (new): an `AsyncLocalStorage` store per request that
  counts provider calls, statements and transactions, attributes them and wall time to named
  phases, renders a `Server-Timing` value (durations and counts only, never identifiers or
  content) and exports `withRequestMetrics(handler)`.
- `src/lib/postgres/client.ts`: `createPostgresClient` wires the postgres.js `debug` hook to the
  counters (`BEGIN` marks a transaction; `COMMIT`/`ROLLBACK`/`SAVEPOINT`/`RELEASE` are not
  counted as queries; the hook receives SQL text only, never parameters).
  `src/lib/postgres/tenant-repositories.ts`: tenant and system transactions accumulate the `db`
  phase. `src/lib/auth/account-service.ts`: `resolveRequestAuthContext` accumulates the `auth`
  phase and counts provider session lookups through `src/lib/auth/auth-metrics.ts` (new).
- `src/proxy.ts` runs inside a metrics store and times the provider middleware call, the
  `getSession` call and `findAccountByIdentity` as `proxy-auth-provider` and `proxy-auth-db`
  through `instrumentNeonProxyDependencies`, so `src/lib/auth/neon-proxy.ts` is untouched and the
  CSRF fixture digest and the three pinned proxy literals are unchanged. Pages and proxy-terminated
  responses get `Server-Timing: proxy-auth-provider;dur=…;desc="calls=2", proxy-auth-db;dur=…;
desc="q=1", proxy;dur=…` directly. For API pass-throughs the proxy instead forwards the value in
  the request header `x-distil-proxy-timing` (set or cleared by the proxy on every request; a
  client-supplied value never survives), because a header set on the pass-through response
  replaces the route's own `Server-Timing` (observed under `next start`). The wrapped routes merge
  it in front of their entries after an allowlist check; unwrapped API routes carry no timing.
- Five hot routes wrapped with `withRequestMetrics`: `GET /api/v1/feed`, `GET /api/items`,
  `GET|POST /api/v1/collections`, `GET|PATCH /api/v1/items/[id]/state`, `POST /api/ai/summarize`.
  Result seen in the browser: `proxy;dur=0.8, auth;dur=0.3, db;dur=21.9;desc="q=7 tx=2",
total;dur=22.4;desc="q=7 tx=2"` on `/api/v1/feed`.
- `tests/perf/round-trips.unit.test.ts` (new): a fake provider, a fake auth repository and the
  `sqlDouble` pattern drive `proxy()` and then `GET /api/v1/feed` and pin today's counts (table
  below). Later phases lower these assertions on purpose. The pinned `account-service` and
  `client` unit tests were updated for the counting wrapper and the `debug` option.
- `scripts/perf/bundle-diff.mjs` (`npm run perf:bundle`) gzips every first-load chunk listed in
  `.next/diagnostics/route-bundle-stats.json` and diffs against the committed
  `docs/perf/route-bundle-stats.baseline.json` (`--write` regenerates; `--fail-on-growth[=N]`
  optional). `scripts/perf/measure-web-vitals.ts` (`npm run perf:vitals`) starts a
  `postgres:16-alpine` Testcontainer, applies migrations 0001–0009 and the Phase 3 roles, seeds one
  active user and 12 ready items through the tenant repositories, starts `next start` through the
  production mode of `tests/support/browser/server.ts` on `127.0.0.1:3100` with the legacy session
  bridge and a signed cookie, and records TTFB, FCP, LCP, DOMContentLoaded, load, request count,
  transferred bytes and every `Server-Timing` value for `/`, `/feed`, `/feed/[id]` and `/settings`
  (one warm-up plus five timed runs each) into the gitignored `.perf/`.
- `package.json` scripts `perf:bundle` and `perf:vitals`; `.gitignore` entry `/.perf/`.

**Deviations from the brief, deliberate**

- The vitals script is `scripts/perf/measure-web-vitals.ts`, not `.mjs`: under Node 22.23 an
  `.mjs` entry could not import the TypeScript support modules even through tsx, and every other
  script in `scripts/` is already a tsx-run `.ts` file.
- The measured origin is `http://127.0.0.1:3100` (the CI full gate's production-E2E convention),
  not port 3000: the client bundle inlines `NEXT_PUBLIC_API_BASE_URL` at build time, so the
  measurement needs `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3100 npm run build` first (the
  script verifies the baked origin and refuses otherwise), and port 3000 was held by another
  session's dev server, which was left alone.
- Files outside the P0 ownership list that changed: the five route files named in the brief,
  `package.json`, `.gitignore`, `docs/perf/`. `docs/authorization-matrix.json` is unchanged (no
  route added or removed).

**Baseline: request cost (from `tests/perf/round-trips.unit.test.ts`, Neon Auth path)**

| Request                                       | Provider calls                | Auth queries                | Transactions                                   | Statements |
| --------------------------------------------- | ----------------------------- | --------------------------- | ---------------------------------------------- | ---------- |
| Proxy, authenticated GET (any path)           | 2 (middleware + `getSession`) | 1 (`findAccountByIdentity`) | 0                                              | 1          |
| `GET /api/v1/feed` route (personalization on) | 1                             | 1                           | 2 (preferences under advisory lock, feed page) | 7          |
| Total per `/api/v1/feed` request              | 3                             | 2                           | 2                                              | 8          |

Live `Server-Timing` under `next start` (legacy auth path, local PostgreSQL, so `auth` is cookie
verification only): `/api/v1/feed` `db;dur≈21ms q=7 tx=2`; `/api/v1/collections` `db≈7.5ms q=3
tx=1`; `/api/v1/items/[id]/state` `db≈9ms q=3 tx=1`. Each tenant transaction spends two of its
statements on `set_config` and the verification `SELECT`.

**Baseline: client JavaScript (`npm run perf:bundle`, Turbopack production build of `8d8de85`,
gzip level 9 of every first-load chunk; zero delta against the committed baseline)**

| Route                              | Raw        | Gzip           | Chunks |
| ---------------------------------- | ---------- | -------------- | ------ |
| shared by every route              | 553.5 kB   | 169.3 kB       | 9      |
| `/`                                | 560.9 kB   | 172.5 kB       | 10     |
| `/feed`                            | 602.5 kB   | 186.1 kB       | 11     |
| `/feed/[id]`                       | 946.4 kB   | 301.0 kB       | 13     |
| `/settings`                        | 572.4 kB   | 175.6 kB       | 10     |
| `/account`, `/onboarding`          | 577.2 kB   | 175.5 kB       | 10     |
| `/research/[id]`                   | 730.0 kB   | 223.7 kB       | 12     |
| `/sources`, `/topics`, `/research` | 591–604 kB | 181.9–184.8 kB | 11     |
| other routes                       | 553–569 kB | 169.3–174.3 kB | 9–10   |

**Baseline: page-load medians (`npm run perf:vitals`, 5 runs, 12 seeded items, Chromium 1440×900,
build `cmZPo49L_pJjWEMls_LH4` on this Mac; local PostgreSQL, so absolute times are far below
Production and the request counts and bytes are the comparable part)**

| Page         | TTFB | FCP   | LCP    | DOMContentLoaded | load  | Requests | Transferred |
| ------------ | ---- | ----- | ------ | ---------------- | ----- | -------- | ----------- |
| `/`          | 7 ms | 28 ms | 100 ms | 22 ms            | 45 ms | 43       | 509 kB      |
| `/feed`      | 3 ms | 24 ms | 96 ms  | 18 ms            | 40 ms | 47       | 477 kB      |
| `/feed/[id]` | 8 ms | 32 ms | 32 ms  | 27 ms            | 55 ms | 40       | 568 kB      |
| `/settings`  | 3 ms | 28 ms | 28 ms  | 14 ms            | 44 ms | 29       | 425 kB      |

Observations for later phases, recorded not acted on: `/feed` prefetches five reader pages and
`/feed/[id]` prefetches `/`, `/feed`, `/search`, `/ask`, `/save` and `/settings` on load (each
prefetch pays the full proxy auth cost in Production); `next start` logged "The requested resource
isn't a valid image for /logo.png received null" on every page load, so `next/image` is failing
for the 60 KB logo (candidate for P4's asset cleanup); the seeded library shows LCP at ~100 ms on
`/` and `/feed` versus ~30 ms on the server-rendered reader.

**Verification (all locally verified 2026-09-17 on `8d8de85`)**

- `npm run check`: ESLint 0 errors / 10 baseline warnings, Prettier clean, `tsc --noEmit` clean,
  Jest 202 suites / 1450 tests passed (includes the 4 new perf tests and the Phase 3 inventory,
  CSRF-digest and authorization-matrix suites).
- `npm run build` (default env) succeeded and wrote `.next/diagnostics/route-bundle-stats.json`;
  `npm run perf:bundle` created the baseline and prints zero delta. A second build with
  `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3100` differs by a few bytes per route only.
- `npm run perf:vitals` ran twice to completion against Docker (`postgres:16-alpine`); all four
  pages returned 200 without redirecting to `/login`.
- Not run: `npm run test:integration`, E2E and extension Playwright (the brief requires them for
  P1, P2 and P7 only; P0 adds no PostgreSQL behaviour).
- Previously recorded external state, not re-checked: Production serving `509fccc`, the release
  pin `unpinned`, Neon branches and the nightly Full gate.

**Restart steps**: `git fetch origin && git switch claude/perf-baseline-627eff` in its worktree;
`npm run check`; for numbers `npm run build && npm run perf:bundle` and
`NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3100 npm run build && npm run perf:vitals` (needs
Docker and a free port 3100). P1 starts from `origin/main` after this PR merges and lowers the
assertions in `tests/perf/round-trips.unit.test.ts` as its acceptance test.

### Branch workflow tooling — 2026-09-16

Docs and configuration only, branch `claude/branch-workflow`. Amit asked for a way to run
several Claude Code sessions against this repository without the rebase and squash friction of
the previous week (PR #18 and PR #19 were written in parallel and both touched this file; one
branch had been committed from two places). What changed:

- `AGENTS.md` §7.1 records the parallel-session routine: one session per branch, branch from
  `origin/main` only, sync with `git merge origin/main` rather than rebase, never reuse a merged
  branch, append-only checkpoints in this file, Claude worktrees under `.claude/worktrees/<task>`
  on `worktree-<task>` branches accepted alongside `claude/<task>`.
- `CLAUDE.md` baseline bullet points at §7.1 and the two skills.
- `.gitignore` now ignores `.claude/*` except `.claude/settings.json` and `.claude/skills/`, so
  shared Claude configuration is tracked; `settings.local.json`, `launch.json` and
  `.claude/worktrees/` stay ignored.
- `.worktreeinclude` lists `.env.local` so Claude-created worktrees get the local environment.
- `.claude/skills/start-task/SKILL.md`: user-invoked `/start-task <name>` (refuse on dirty tree,
  fetch, enter or confirm a fresh worktree from `origin/main`, `npm ci`, report).
- Local, not in the repo: `git config rerere.enabled true` in the main checkout.

Not written (auto-mode classifier refused every attempt, by Write and by shell): the shared
`.claude/settings.json` (permission allowlist for fetch, status, log, diff, branch, worktree,
switch, fast-forward merge and push of task branches, `gh pr view|list|checks|create`,
`gh run`, `npm run check*`, `npm ci`, `npx prettier`; `autoMode.allow` entry for branch and
worktree housekeeping;
`worktree.baseRef: fresh`) and `.claude/skills/finish-task/SKILL.md` (sync by merge, append
checkpoint, `npm run check`, commit, push, `gh pr create`, `gh pr checks --watch`, squash merge
on Amit's request, `ExitWorktree`, fast-forward `main`, remove worktree and branch). Claude Code
saved both files' content in its session scratchpad and printed it in chat; Amit adds them by
hand on this branch before merging. `gh pr merge` stays only in the gitignored
`settings.local.json`.

Locally verified 2026-09-16: `git check-ignore` confirms the new ignore rules track
`.claude/settings.json` and `.claude/skills/**` and still ignore `settings.local.json`,
`launch.json` and `.claude/worktrees/`; `npx prettier --check` clean on the changed markdown.
No code, tests, dependencies, environment variables or deployments changed.

### Performance analysis and phased plan — 2026-09-16

Docs-only checkpoint on branch `claude/perf-plan` (worktree `/Users/amitsharma/Projects/distil-perf-plan`,
based on `main` at `abe43d3`). Amit asked for a deep performance analysis with the goal of an
"extremely lightweight and responsive" app: faster loads, fewer LLM calls, more caching and reuse.
Three read-only exploration passes (request path and database, AI/LLM usage, client bundle) were run
by Claude Code and every claim below that drives a phase was re-verified against the code at
`abe43d3`. Bundle numbers come from the local Turbopack build of 2026-09-16
(`.next/diagnostics/route-bundle-stats.json`). No code, test, dependency, environment variable,
deployment or Production data changed in this task. Production is single-user with an intentionally
near-empty library, so **per-request latency, cold-start weight, client waterfalls and bundle size
dominate; indexes and N+1 fixes are cheap hygiene, not the headline.**

Each phase below is written as a standalone brief: goal, files, approach, tests to update, how to
verify, and what to record. Before starting a phase, re-check the quoted file:line references against
current `main`; they were accurate at `abe43d3`.

#### Verified findings

**A. Every request authenticates three times (the dominant cost).** The `src/proxy.ts` matcher
(`/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)`, line 112) runs the full
auth pipeline on every page navigation, RSC prefetch and API call. Line 72 eagerly awaits
`getAuthRepositoryPort()`, which dynamic-imports the 2058-line `src/lib/postgres/repositories.ts` and
opens a pool, before `authorizeNeonProxy` (`src/lib/auth/neon-proxy.ts:84-89`) short-circuits public
paths. For an authenticated request the proxy makes two uncached Neon Auth HTTP calls: the SDK
middleware with `disableCookieCache=true` (`neon-proxy.ts:94-102`) and then
`getSession({ query: { disableCookieCache: "true" } })` inside `readProviderIdentity`
(`src/lib/auth/request-context.ts:49`), followed by one database lookup `findAccountByIdentity`
(`src/lib/postgres/auth-repository.ts:182`). The proxy then writes `x-distil-user-id`,
`x-distil-actor-id`, `x-distil-actor-kind` and `x-distil-fresh-auth` (`neon-proxy.ts:126-129`) but
nothing reads them: all ~63 route handlers and the reader page call `resolveRequestAuthContext`
(`src/lib/auth/account-service.ts:29-45`), which repeats a provider call and the database lookup. Net
cost is three provider round trips and two auth queries per API request, two plus one per page render.
There is no React `cache()`, `unstable_cache` or `"use cache"` anywhere in `src/`. The rate limiter
(`src/lib/middleware/rate-limit.ts`) is a per-instance in-memory `Map`, prunes the whole map on every
request and runs after the expensive auth work. The `sessionDataTtl: 300` in
`src/lib/auth/neon-server.ts` is defeated by design because provider-side revocation must be observed
on the next request (commit "fix(auth): enforce immediate session revocation"); Amit confirmed on
2026-09-16 that this invariant stays.

**B. Database: about five round trips per repository call, wide rows everywhere.** In
`src/lib/postgres/tenant-repositories.ts:58-99` every repository method opens its own transaction:
`BEGIN`, one `SELECT set_config(...)` for six settings, a second `SELECT` that re-reads
`current_setting` to verify them, the actual query, `COMMIT`. That verification query is pinned by
`src/lib/postgres/__tests__/tenant-repositories.unit.test.ts:52` and mirrored by the fakes in
`tests/security/phase3-boundaries.integration.test.ts:36`. `bindRepositorySet` (lines 115-151) rebuilds
all 30 repository objects inside every call. `src/lib/database.ts` creates five separate pools (lines
33, 54, 68, 88, 89; `max: 4` each) per warm instance; the auth pool exists only for
`findAccountByIdentity`. `SELECT i.*` in `src/lib/postgres/repositories.ts:92` (`list()` defaults to
`LIMIT 1000000`, line 61) and `src/lib/feed/feed-query.ts:387` pulls `full_content`, `extracted_links`,
`detected_media`, `content_classification` and the `search_vector` into every item; `mapItem`
(`src/lib/postgres/mappers.ts:14`) copies them into `ContentItem` and the list APIs return them
verbatim. `src/app/feed/[id]/page.tsx:183-192` loads the entire library with full content just to
compute prev/next links, and lines 153-156 re-resolve auth the proxy already did. Independent reads run
in series in `src/lib/knowledge/service.ts:268-279` (five transactions) and
`src/lib/phase2/reader-service.ts` (lines 164, 214-237, 264, 297-298, 416-433).
`src/lib/digests/postgres-store.ts:88-106` takes an advisory lock to read preferences, on every
`/api/v1/feed` request (`src/app/api/v1/feed/route.ts:82`). The affinity subquery in
`feed-query.ts:322-350` is interpolated into SELECT, ORDER BY and the cursor WHERE, so it is evaluated
per row before LIMIT. N+1 patterns: `postgres-store.ts:143`, `repositories.ts:452`,
`repositories.ts:1434-1440`, `repositories.ts:1495-1499`; `items.insert`/`update` do find, write, find
as three transactions. Present and good: GIN indexes on the stored `search_vector` columns and the
`(user_id, id)` unique set. Missing for the real query shapes: `items(user_id, created_at DESC)`
partial on ready/unarchived rows, `item_events(user_id, event_type, occurred_at DESC)`, a GIN index on
`items.topics`.

**C. Pages ship empty shells and then fetch through the proxy again.** Only `/feed/[id]` is a real
server component. `/` (`src/app/page.tsx:10`, `force-dynamic`) renders the client
`src/components/phase2/today-experience.tsx`, which fetches `/api/v1/feed` twice, once with
`limit=100` and then filters to three items (lines 54-70). `/feed` (`src/app/feed/page.tsx`,
`"use client"`) requests `limit=100` (lines 112-119), refetches the whole list every three seconds
while any item is processing (lines 203-207) and re-applies filters client-side on top of the server
filters (lines 209-220). `/search`, `/ask`, `/archive`, `/collections`, `/digests`, `/settings` and
`/account` all render nothing until a second round trip; `src/components/account/account-center.tsx`
has a two-deep waterfall of about seven requests (lines 107, 128, 134-138). About 30 client fetch
sites build absolute URLs from `config.apiBaseUrl` (`src/lib/config.ts:46`, default
`http://localhost:3000`), which drags `src/lib/config.ts` into the client bundle from 22 files for one
field; `account-center.tsx` already uses relative URLs. There is no client cache; `staleTimes.dynamic`
is 0 so every back-navigation refetches; `router.refresh()` in
`src/components/feed/mark-read-button.tsx:42`, `lazy-article-extract.tsx:51` and
`account-center.tsx:185,228` re-renders the whole reader payload to flip one flag. `thumbnailUrl` is
populated by `src/lib/og.ts`, shipped in every payload and never rendered. `loading.tsx` exists only
for `/`, `/feed`, `/settings` and `/topics`.

**D. Bundle.** Shared first-load JavaScript is about 553 KB raw (roughly 169 KB gzip) across 23
routes; `/feed/[id]` is 969 KB raw (roughly 296 KB gzip); the render-blocking stylesheet is 89.6 KB
raw; four preloaded woff2 files total about 178 KB per page; a 112 KB legacy polyfill chunk ships
because `tsconfig.json` targets `ES2017`. `sanitize-html` (228 KB raw, 81 KB gzip) is in the client
bundle because `src/components/feed/ai-summary.tsx:11` and `src/components/feed/reader-view.tsx:7`
import `sanitizeArticleHtml` as a value, although content is sanitized on ingest
(`src/lib/content-extractor.ts:15`) and the reader page is a server component that passes
`item.fullContent` as a prop. `react-markdown` plus `remark-gfm` (141 KB raw) load eagerly on the
reader for static text. `Geist_Mono` is loaded in `src/app/layout.tsx:22-25` with zero `font-mono`
usages and without `display: "swap"`. The theme is applied in a `useEffect`
(`src/components/layout/theme-provider.tsx:39-41`) with a server snapshot of `"light"`, so dark-mode
users always see a light flash. `next.config.ts` lacks `experimental.optimizePackageImports` for the
`radix-ui` meta-package, `experimental.inlineCss` and `experimental.staleTimes`, and still carries the
SQLite-era `experimental.cpus: 1`. `public/icons/icon-512.png` is 259 KB, `icon-192.png` 50 KB,
`apple-touch-icon.png` 45 KB and `public/logo.png` 60 KB for a 28-pixel render; the CRA template SVGs
in `public/` are unused. Nothing uses `next/dynamic` or virtualization. Already good: server-only
packages (`googleapis`, `jsdom`, `openai`, `playwright`, `better-sqlite3`, `@slack/web-api`, `pino`)
never reach the client, `lucide-react` icons are imported individually, list cards use `stripMarkdown`
rather than `react-markdown`, and no remote images are rendered.

**E. AI and LLM usage.** The durable capture path makes zero LLM calls: `src/lib/knowledge/capture-index.ts`
writes a deterministic extractive `brief_summary` artifact, and the LLM brief is generated only when
the reader button calls `POST /api/ai/summarize`, whose `src/lib/ai/summarize.ts:143` checks the
`ai_summaries` cache first. Router and provider clients are `globalThis` singletons, daily and 30-day
budgets exist, and summary attempts have 15-second timeouts with a same-provider fallback. Waste:
`src/lib/ai/search.ts:51` and `src/lib/agent/rag.ts:169` call `generateEmbedding` for every hybrid
search or chat message although nothing writes `item_embeddings` (the only writer,
`src/lib/ai/embeddings.ts:130`, is reachable only from the uncalled `agent/workflows/triage.ts`), so
each search pays for an embedding and scores an empty set. Each tenant LLM call in
`src/lib/ai/router.ts:356-410` performs a budget check plus an advisory-locked `consumeUsage`
(`src/lib/postgres/lifecycle-repositories.ts:350-369`), an audit insert and a second `consumeUsage`,
all awaited in the hot path (about six database round trips) and serialized per user by the lock.
`summarize.ts:179-183` runs map-reduce chunks sequentially. There is no provider prompt caching. The
`ai_summaries` key `(user_id, item_id, prompt_type)` has no content hash. Gemini `generateText` has no
timeout or `maxOutputTokens` (`src/lib/ai/providers.ts:53,57`). `rag.ts:211-217` sends greetings to
Claude Sonnet. Research is six to ten calls, four of them Sonnet. Dead AI code with no callers:
`src/lib/ai/tagger.ts`, `src/lib/agent/workflows/triage.ts`, `src/lib/agent/insight-detection.ts`,
`runAgent` in `src/lib/agent/orchestrator.ts`, `src/lib/ai/client.ts`, `src/lib/ai/circuit-breaker.ts`;
also `src/lib/notifications.ts` and the unmounted `src/components/agent/agent-status-panel.tsx`.
Functional gap, not a cost: the tenant job types `regenerate_intelligence_summary`, `digest_run` and
`knowledge_backfill` are enqueued but never handled (see the open item in the handoff).

#### Constraints every phase must respect

`tests/fixtures/phase3/neon-csrf-boundary.json` pins a SHA-256 of `src/lib/auth/neon-proxy.ts`, and
`tests/support/phase3-authorization-inventory.ts:329-337` regex-pins three literals in
`src/proxy.ts` (`import { authorizeNeonProxy } from "@/lib/auth/neon-proxy";`,
`await authorizeNeonProxy(request, traceId, {`, `allowedOrigins: readAuthEnvironment().allowedOrigins`);
any edit to those files refreshes the digest and keeps the literals. `docs/authorization-matrix.json`
carries `expectedApiRouteFileCount: 92` and `expectedPageFileCount: 22`, which change with every route
added or removed, and every new route needs a matrix entry plus adversarial tests. Deterministic tests
never touch the network. Migrations and any Production change need Amit's task-specific approval.
Every phase branch includes its own update of this file.

#### P0 — Measurement baseline (`claude/perf-baseline`, no behavior change)

Goal: repeatable before/after numbers without touching Production configuration. Add
`src/lib/observability/request-metrics.ts` (an `AsyncLocalStorage` store counting provider calls,
database queries and transactions through the postgres.js `debug` hook in `createPostgresClient`, and
named phases; a `serverTimingHeader()` helper). `src/proxy.ts` emits
`Server-Timing: proxy-auth-provider;dur=…, proxy-auth-db;dur=…, proxy;dur=…` (no secrets; visible in
browser DevTools on Production after any later deploy). A small `withRequestMetrics(handler)` wrapper
on the five hot routes (`/api/v1/feed`, `/api/items`, `/api/v1/collections`,
`/api/v1/items/[id]/state`, `/api/ai/summarize`) appends `auth;dur=…, db;dur=…;desc="q=N tx=M"`. Add
`tests/perf/round-trips.unit.test.ts`: a fake provider plus the `sqlDouble` pattern from
`src/lib/postgres/__tests__/tenant-repositories.unit.test.ts` drives `proxy()` and then
`GET /api/v1/feed`, asserting today's counts (proxy: two provider calls, one database query; route: one
provider call, one auth query, two transactions). Later phases lower those assertions; this test is
the regression fence. Add `scripts/perf/measure-web-vitals.mjs` (Playwright against `next start`
through the existing production mode of `tests/support/browser/server.ts` with a legacy session cookie
and Docker PostgreSQL; TTFB, FCP, LCP, request count and transferred bytes for `/`, `/feed`,
`/feed/[id]`, `/settings`, five runs each, written to a gitignored `.perf/` directory) and
`scripts/perf/bundle-diff.mjs` (diffs `.next/diagnostics/route-bundle-stats.json` against a committed
`docs/perf/route-bundle-stats.baseline.json`). Add `perf:vitals` and `perf:bundle` scripts and the
`.perf/` gitignore entry. Verify: `npm run check`; `npm run build && npm run perf:bundle` prints zero
delta. Record: the baseline table (provider calls, queries, transactions per request; gzip per route;
vitals medians) in the checkpoint.

#### P1 — One auth verification per request and a trusted handoff (`claude/perf-auth-handoff`)

Goal: an API request goes from three provider calls plus two auth queries to one plus one, both in
the proxy; a page render from two plus one to one plus one; public paths never load the repositories
module. Steps: (1) Add `verifySession(request)` to `NeonProxyProvider`, implemented in
`src/lib/auth/neon-server.ts` on the SDK's public route handler: build a synthetic
`GET /api/auth/get-session?disableCookieCache=true` request carrying the inbound cookies and call
`auth.handler().GET(request, { params: Promise.resolve({ path: ["get-session"] }) })`, the same code
path `src/app/api/auth/[...path]/route.ts` exposes. Its JSON body is the session and its `Set-Cookie`
headers are the refreshed `session_data` cookie. (Verified 2026-09-16: the internal
`handleAuthProxyRequest` and `processAuthMiddleware` helpers are not exported from
`@neondatabase/auth/next/server`; the SDK middleware performs the same upstream `get-session` fetch
and discards the body, which is why two calls happen today.) `authorizeNeonProxy` drops the
`provider.middleware(...)` call and feeds the session JSON into the unchanged
`resolveNeonAuthRequest` through a one-shot `{ getSession }` adapter; unauthenticated `/api/*` gets a
401 JSON body and pages get a 307 to `/sign-in`. Fallback if the handler is awkward in the Edge
runtime: one `getSession({ query: { disableCookieCache: "true" } })` call without proxy-side cookie
refresh. (2) `authorizeNeonProxy` takes `repositories: () => Promise<AuthRepositoryPort>` so
`getAuthRepositoryPort` is only awaited after the public-path check, and
`src/lib/auth/repository-runtime.ts` constructs `new PostgresAuthRepository(sharedSql)` instead of the
30-repository set. (3) Replace the four `x-distil-*` headers with one `x-distil-identity` HS256 token
from a new `src/lib/auth/identity-token.ts` (extract `signature` and `signaturesEqual` from
`src/lib/auth/session.ts`); claims `{ sub, kind, sid?, fresh, jti: traceId, iat, exp: iat + 120 }`;
key derived from `NEON_AUTH_COOKIE_SECRET` (else `DISTIL_SESSION_SECRET`) through
`readAuthEnvironment()`; signing keeps correctness independent of the matcher. (4) Strip inbound
`x-distil-*` and `x-trace-id` at the top of `proxy()` before any branch; public and specialized
branches return the sanitized headers. (5) `resolveRequestAuthContext`: a valid token whose `jti`
equals `x-trace-id` yields `createAuthContext` from the claims with zero I/O; an absent token falls
back to today's full resolution (queue routes, `POST /api/items`, capture tokens keep working); an
invalid token is treated as absent and logged as `auth_handoff_rejected`. Wrap the function in React
`cache()` so layout and page share one resolution. (6) The rate limiter runs before auth for `/api/*`
and prunes only when the map exceeds 512 entries. (7) The matcher additionally excludes
`robots.txt`, `sitemap.xml`, `logo.png`, `*.svg` and `sw.js`; RSC prefetches stay covered because
they carry tenant data. Tests: rewrite `src/lib/auth/__tests__/neon-proxy.security.unit.test.ts`
around `verifySession` keeping every existing guarantee and adding "exactly one provider call",
"inbound identity header stripped on public and specialized paths" and "provider Set-Cookie
forwarded"; move the `disableCookieCache` assertion in
`src/lib/auth/__tests__/request-context.security.unit.test.ts` to the adapter; extend the
`account-service` tests with accepted, tampered, expired, `jti` mismatch and missing-token cases; add
`identity-token.security.unit.test.ts`; refresh the CSRF fixture digest; lower
`tests/perf/round-trips.unit.test.ts` to proxy one plus one and route zero plus zero. Verify:
`npm run check`, `npm run test:security`, `npm run test:integration`, the `full-ci` label, and
`Server-Timing` on `/api/v1/feed` showing `auth` under one millisecond. Rollback: revert the PR;
consumers fall back to full resolution automatically, so a proxy-only revert is also safe.

#### P2 — Database round-trip diet (`claude/perf-db-roundtrips`)

Goal: one shared pool, one transaction per request, no verification round trip, no full-content list
scans. Add `getSharedPostgresClient(url)` in `src/lib/postgres/client.ts`, memoized on `globalThis`
per URL, and make every `DATABASE_URL` composition root in `src/lib/database.ts` share it (the
control-plane URL stays separate). In `src/lib/postgres/tenant-repositories.ts` fold the verification
into the same round trip (`WITH applied AS (SELECT set_config(...)) SELECT current_setting(...) FROM
applied`), keeping the invariant with one query, and add `withTenantRepositories(context, fn)` that
opens one transaction and binds the repository set once (nested `begin` calls already become
savepoints). Adopt it in `src/app/api/v1/feed/route.ts`, `src/app/feed/[id]/page.tsx`,
`src/lib/knowledge/service.ts` (`Promise.all` the independent reads in `getItemIntelligence`) and
`src/lib/phase2/reader-service.ts`. Add `ContentItemSummary` to `src/lib/types.ts` (`ContentItem`
without `fullContent`, `extractedLinks`, `detectedMedia`, `contentClassification`, `thumbnailUrl`),
`mapItemSummary` in `src/lib/postgres/mappers.ts`, an explicit column list in
`PostgresFeedQuery.list` and a new `items.listSummaries`; `FeedItem` becomes
`ContentItemSummary & { rank }`; `list()` defaults to 200 rows. Replace the reader's
`repositories.items.list()` with `items.findNeighbours(itemId, { unreadOnly })` (two `LIMIT 1` keyset
queries on `(created_at, id)`). Make `getPreferences` a plain `SELECT` (lock only in writers). Drop
`content` and `search_vector` from the chunk-metadata query at `repositories.ts:1117` and batch the
claims-to-evidence lookup with `WHERE claim_id = ANY($1)`. Tests:
`tenant-repositories.unit.test.ts` (`queries[0]` now contains both `set_config` and
`current_setting`; one `begin` for three reads through `withTenantRepositories`), the fakes in
`tests/security/phase3-boundaries.integration.test.ts` answering the combined query, feed-query unit
tests asserting no `full_content`, the reader page component test using `findNeighbours`,
`tests/security/phase3-rls.integration.test.ts` unchanged as the real RLS proof, and the round-trip
test asserting one transaction for the feed route. Verify: `npm run check`,
`npm run test:integration` (Docker). Rollback: per-file revert; the projection is additive while
`list()` remains.

#### P3 — Client payload and network (`claude/perf-client-network`)

Goal: smaller responses and fewer requests without changing what the pages show. Add
`src/lib/public-config.ts` exporting only `apiBaseUrl` and switch every client fetch to relative
`/api/...` URLs so `src/lib/config.ts` leaves the client graph (`config.apiBaseUrl` stays for the
extension and tests). List APIs return `ContentItemSummary` from P2; `/api/items` gets a default
`limit=100`. Add `GET /api/v1/items/status?ids=` (at most 50 ids, `requireTenantRoute`, returns
`{ id, processingStatus }` pairs; `applyPrivateApiCacheControl` already covers `/api/v1`); `/feed`
polls it every three seconds while items are processing and patches single items, and drops the
client-side re-filtering (server filters are authoritative; keep only the `rejected` guard).
`today-experience.tsx` makes one request (`/api/v1/feed?sort=priority&limit=6` plus a server-side
`resurface=stale` filter implementing the 14-day rule) instead of the `limit=100` call. Set
`experimental.staleTimes: { dynamic: 30, static: 300 }` in `next.config.ts`. Make mark-read, extract
and account updates optimistic with `router.refresh()` only on failure. Delete the unmounted
`agent-status-panel.tsx` and stop shipping `thumbnailUrl`. Tests: feed and today component tests,
a new `src/app/api/v1/items/status/__tests__/route.security.unit.test.ts` (owner, anonymous 401,
foreign ids omitted, malformed input), the matrix entry for the new route with
`expectedApiRouteFileCount` moving to 93, and the `/api/v1/feed` mocks in `tests/e2e/phase2.spec.ts`.
Verify: `npm run check`, `npm run test:e2e`; a feed with a processing item issues only status polls.

#### P4 — Bundle and rendering (`claude/perf-bundle`)

Goal: shared first-load under 120 KB gzip and `/feed/[id]` under 170 KB gzip, measured with
`npm run perf:bundle`. Sanitize server-side: `src/app/feed/[id]/page.tsx` passes
`sanitizeArticleHtml(item.fullContent)` and `ai-summary.tsx` and `reader-view.tsx` drop the import
(escape plain text instead), removing the 228 KB `sanitize-html` chunk. Load the `ReactMarkdown`
blocks in `ai-summary.tsx` and `src/components/agent/chat-panel.tsx` and the `ReaderView` overlay
through `next/dynamic`. In `src/app/layout.tsx` remove `Geist_Mono` and its CSS token and add a
blocking inline script in `<head>` that applies `.dark` from `localStorage.theme` before first paint
(the CSP already allows inline scripts); `theme-provider.tsx` reads the class on the client. In
`next.config.ts` add `experimental.optimizePackageImports: ["radix-ui"]` and
`experimental.inlineCss: true` and remove `experimental.cpus`; set the `tsconfig.json` target to
`ES2022`. Re-encode `public/icons/*.png` (target under 40 KB for the 512-pixel icon), replace
`logo.png` with a small SVG or WebP and delete the unused CRA SVGs. Delete `/sources`, `/topics` and
`/research` (pages, and the `/api/ai/research/**` and `/api/agent/**` routes once nothing else
imports them), the dead AI modules, `src/lib/notifications.ts` and `agent-status-panel.tsx`, then
update `expectedApiRouteFileCount`, `expectedPageFileCount`, the matrix entries, the CSRF fixture's
`centrallyProtectedSurfaces` and the sidebar and topbar links. Last, add `babel-plugin-react-compiler`
as a devDependency with `reactCompiler: true`, keeping it only if `npm run build` time and the e2e
suite stay green. Verify: `npm run build && npm run perf:bundle`, `npm run test:e2e`; a dark-mode
reload shows no light flash. Rollback: each config flag reverts independently; server-side sanitizing
is a strict tightening.

#### P5 — Server-render `/` and `/feed` (`claude/perf-server-render`, after P1–P3)

Goal: the first HTML already contains the data. `src/app/feed/page.tsx` becomes an async server
component: a shared zod schema in `src/lib/feed/feed-params.ts` (also used by the API route), one
`withTenantRepositories` transaction for `feed.list()` and `collections.list()`, and a
`<FeedList initialPage filters>` client island rendered inside `<Suspense>` with the existing
`loading.tsx`. Filter changes use `router.replace` with `scroll: false`; load-more and the status
poll stay client-side against `/api/v1/feed?cursor=` and `/api/v1/items/status`. `src/app/page.tsx`
drops `force-dynamic`; a server `TodaySections` component queries directly and
`today-experience.tsx` becomes presentational. Then run a spike on `cacheComponents: true` with
`"use cache: private"` around the per-user page data (guide:
`node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`) and adopt it
only if it lands without moving every `headers()` call behind Suspense at unacceptable churn. Tests: a
server-component render test with fake repositories, the matrix `pageLoaders` entries for `/feed`
and `/` pointing at direct tenant repositories, updated e2e mocks. Keep the old client page behind a
flag for one release. Verify: `npm run check`, `npm run test:e2e`, `perf:vitals` TTFB and LCP deltas.

#### P6 — AI cost and latency (`claude/perf-ai`)

Goal: fewer and cheaper model calls, no accounting on the critical path, and Amit's per-capture
brief. In `src/lib/ai/search.ts:51` and `src/lib/agent/rag.ts:169` skip `generateEmbedding` unless
`embeddings.count() > 0` (add the count) and bound `listRecent` to 500 rows. In
`src/lib/ai/router.ts:356-410` keep one admission check, move the audit insert and the second
`consumeUsage` off the critical path with Next `after()`
(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`), turn `consumeUsage`
into a lock-free `INSERT … ON CONFLICT DO UPDATE … RETURNING`, and use provider-returned token
usage. In `src/lib/ai/summarize.ts` run the chunk calls under `p-limit(3)` with `Promise.all`, add a
60-second per-item cooldown on `force`, and include the content hash in the cache key once P7 adds
the column. In `src/lib/ai/providers.ts` give Gemini `generateText` a `timeoutMs` and
`maxOutputTokens`, and set Anthropic `cache_control: ephemeral` on the Sonnet system preambles (load
the `claude-api` skill first). In `rag.ts` answer conversational intent without a model call, and
cache `/api/v1/answers` by `(userId, normalized question, passage-id hash)` for 24 hours. Per-capture
brief (Amit's decision 3): in `src/app/api/queue/capture-requests/route.ts` the `enqueueEnrichment`
hook calls the existing `generateSummary(context, repositories, itemId, { length: "brief" })` after
`indexCapturedItem` succeeds (tenant router, budget-admitted, flash-lite with the existing quota
fallback and 15-second per-attempt timeout; fits `maxDuration = 60`). The receipt is already `ready`
before the summary runs; any failure is caught and logged as `capture_summary_skipped`, leaving the
extractive `brief_summary` artifact; the URL-dedupe path in `src/lib/capture/worker.ts:196` never
re-summarizes; `summaries.find(itemId, "brief")` short-circuits replays. Kill switch:
`FEATURE_CAPTURE_SUMMARY` in `src/lib/phase2/feature-flags.ts`, read as `!== "false"` so it is on
by default and needs no Production variable. Tests: router unit (accounting recorded once, off the
critical path), summarize unit (parallel chunks, cooldown), search unit (no embedding when empty),
queue route unit (summary runs after ready, failure does not fail the capture, dedupe skips it, flag
off skips it); `evals/` fixtures unchanged; the `capture-requests` matrix entry's data path gains
"brief summary generation". Verify: `npm run check`, `npm run test:integration`, the `full-ci`
label.

#### P7 — Indexes (`claude/perf-indexes`; the Production run needs Amit)

Add `src/lib/postgres/tenant-migrations/0010_perf_indexes.sql` with
`items(user_id, created_at DESC, id DESC) WHERE archived_at IS NULL AND processing_status = 'ready'`,
`item_events(user_id, event_type, occurred_at DESC)`, `items USING gin(topics jsonb_path_ops)` and
the `ai_summaries.content_hash` column used by P6. `CREATE INDEX CONCURRENTLY` cannot run inside the
ledger transaction, so either run this migration non-transactionally in `scripts/migrate-tenant.ts`
or accept brief locks on a tiny library. Extend `tests/harness/migration-invariants.unit.test.ts`
and `tests/security/phase3-wave4-query-plans.integration.test.ts` with `EXPLAIN` assertions.
Afterwards turn the affinity subquery in `feed-query.ts:322-350` into a `LEFT JOIN LATERAL`
computed once per row. Verify locally with `npm run test:integration`; the Production run is a
separate approval, recorded with the migration ledger row and the Neon branch id by non-secret
identifier. Rollback: `DROP INDEX`.

#### Order, ownership and recording

Order: P0, then P1, P2, P3, P4, P5, P6, P7, one PR each, opened only after `npm run check` passes
and this file is updated on the branch; merging and any deployment wait for Amit. If Codex works in
parallel, Claude is the integration owner and the split is: Claude owns `src/proxy.ts`,
`src/lib/auth/**`, `src/lib/postgres/**`, `src/lib/database.ts`, `src/lib/feed/feed-query.ts`,
`src/lib/knowledge/service.ts`, `src/lib/phase2/reader-service.ts`, `src/app/feed/[id]/page.tsx`,
`src/app/page.tsx`, `src/app/feed/page.tsx` (P5), `tests/perf/**`, `scripts/perf/**` (phases P0, P1,
P2, P5, P7); Codex owns `src/components/**`, `src/app/api/v1/items/status/**`, `src/app/layout.tsx`,
`next.config.ts`, `tsconfig.json`, `public/**`, `src/lib/public-config.ts`, `src/lib/ai/**`,
`consumeUsage` in `lifecycle-repositories.ts` and the legacy route deletions (phases P3, P4, P6).
Shared files are only this file and `docs/authorization-matrix.json`. Each phase checkpoint records
the commit and PR, the before/after numbers from `tests/perf/round-trips.unit.test.ts` (provider
calls and queries per request), `npm run perf:bundle` gzip deltas per route, `perf:vitals` medians
for `/`, `/feed`, `/feed/[id]` and `/settings`, the tests run locally versus previously recorded
external state, and any deployment or migration identifier.

Risks: P1 is the most security-sensitive change and is mitigated by the signed token with trace
binding and 120-second expiry, the automatic fallback to full resolution, the refreshed CSRF digest
and the full gate. P2 changes transaction scoping for multi-call services (nested writes still
savepoint; the integration suite is the gate). P3 changes list payload shapes (no consumer reads
`fullContent` from lists except the `/sources` page deleted in P4). P4 items are config-only
reverts. P5 is the largest UI change and stays behind a one-release flag. P6 moves accounting off
the critical path, so `after()` is required to avoid losing rows on function freeze. P7 index
creation can lock briefly and is revertible.

### iPhone Home Screen reinstall notes — 2026-09-16

Docs-only change on branch `claude/pwa-reinstall-notes`. Amit's installed Distil web app on iOS
stopped working after the origin moved to `distilai.app`: an iOS home-screen web app is pinned
to the origin it was added from, keeps its own cookie jar, and the old Vercel origin is no longer
trusted by Neon Auth for sign-in. `docs/iphone-shortcut.md` now tells the reader to install from
Safari at `https://distilai.app/save` after signing in, to expect a second sign-in inside the
installed app, and how to remove and reinstall an icon added from an older origin. Locally
verified 2026-09-16: `https://distilai.app/manifest.webmanifest` serves `start_url: /save` with
`display: standalone`; anonymous `/save` returns 307 to `/sign-in`, which returns 200. No code,
tests or deployments changed.

### Tiering and UI simplification released; pin unpinned — 2026-09-16

Authorized by Amit in chat on 2026-09-16 ("go ahead and do all that") after the integration
checkpoint above. Steps, in order, all performed by Claude Code:

- Release pin `DISTIL_PHASE3_PRODUCTION_SHA` set to `509fccc584717f276acf2763615bc7a0ab1eec88`
  (the `main` head after PR [#16](https://github.com/amitsharmaak/distil/pull/16)); the Git
  auto-deployment of the merge, `project-evgf1-d4e826kv3`, had correctly failed the preflight on
  the old pin minutes earlier. `npx vercel deploy --prod` from a clean `main` checkout produced
  `dpl_DMRkvC5CgYvMW9apSP6yfn93P3SH` (`project-evgf1-1m1k4jpdz-pv-1850.vercel.app`, preflight
  passed, Ready, build 2 min). `distilai.app` and `www.distilai.app` received the alias
  automatically; `distil-pv-1850.vercel.app` was re-aliased explicitly.
- Locally verified on both origins: `/api/health` 200 with `cache-control: no-store` and the
  expected body; `/sign-in`, `/invite`, `/reset-password` 200; anonymous `/feed` and `/settings`
  307 to `/sign-in`; `POST /api/auth/sign-in/password` 403 without an allowed Origin. No sign-in,
  capture or provider call was made, so the simplified authenticated shell has not been seen by
  a person on Production.
- Pin then changed to the literal `unpinned` on Production (the variable was removed and re-added;
  it remains present and required). No `DISTIL_PHASE3_REHEARSAL_SHA` exists on Preview, so
  nothing was changed there. From this point every push to `main` auto-deploys.
- Full gate run [35069719357](https://github.com/amitsharmaak/distil/actions/runs/35069719357)
  triggered via `workflow_dispatch` on `main` at `509fccc`: static and deterministic tests,
  PostgreSQL integration, web and mobile E2E, extension E2E, production build and the
  non-blocking coverage report all succeeded; the failure-reporting job was skipped as designed.
- Cleanup: PRs #8 and #15 closed as superseded; remote branches `claude/test-tiering` and
  `claude/ui-simplification` deleted; the local `distil-ui-simplification` worktree is left for
  Amit to remove.

### Tiered testing strategy — 2026-09-16

Branch `claude/test-tiering`, PR [#15](https://github.com/amitsharmaak/distil/pull/15) (Claude
Code; not merged or deployed at this checkpoint). On the PR the Quick gate passed in 1 min 52 s
(Actions run 35067582448) and the Full gate correctly skipped without the `full-ci` label; the
required checks on `main` are `quality-gate` and Vercel. Audit, measured
locally on a 16-core Mac: `npm run typecheck` 5 s; `npm test` with `--runInBand` 16 s for 201
suites / 1440 tests; the same Jest run with parallel workers 3.6 s, all passing; the eight-job CI
`quality-gate` about 3.5 min wall and roughly 15 runner-minutes per push (measured on Actions run
35066944173); every Production deploy needed a manual edit of the `DISTIL_PHASE3_PRODUCTION_SHA`
pin. Decision (Amit, 2026-09-16): the project is in an iteration
phase with one user and at most one friend, so verification is re-tiered by when it runs; no tests
are deleted.

- Tier 0 `npm run check:quick` = `tsc --noEmit && jest --onlyChanged` (seconds, while editing).
- Tier 1 `npm run check` = lint + typecheck + `npm test` (about a minute locally). CI "Quick gate"
  (`.github/workflows/ci.yml`, single job `quality-gate`) runs it on every PR and push to `main`
  and remains the only required status check besides Vercel.
- Tier 2 `npm run check:full` = check + `test:integration` + `test:e2e` + `test:extension` +
  `build` (needs Docker); `test:ci` now aliases it. CI "Full gate"
  (`.github/workflows/full-gate.yml`) runs jobs `deterministic`, `postgres-integration`,
  `browser-e2e`, `extension-e2e`, `production-build` and a non-blocking `coverage` report nightly
  at 02:30 UTC on `main`, on `workflow_dispatch`, and on PRs carrying the `full-ci` label; a failed
  scheduled run opens or updates the GitHub issue "Nightly full gate failed".

Files changed: `package.json` (new `check`, `check:quick`, `check:full`; `--runInBand` dropped
from every deterministic Jest script and kept only for `test:live` and inside
`scripts/run-postgres-integration.mjs`), `.github/workflows/ci.yml` (slimmed to the Quick gate),
new `.github/workflows/full-gate.yml`, `src/lib/operations/phase3-auth-activation.ts` plus its
unit test (the literal `unpinned` for `DISTIL_PHASE3_PRODUCTION_SHA`, and
`DISTIL_PHASE3_REHEARSAL_SHA` on Preview, skips the `sha-binding` finding; all other findings
still apply; an exact SHA re-tightens), `AGENTS.md` §3–5 and §9, `CONTRIBUTING.md`,
`tests/README.md`, `docs/vercel-deployment.md` ("Release pin"),
`docs/runbooks/phase3-auth-activation.md` and this file.

Locally verified: the audit measurements above (parallel Jest 201 suites / 1440 tests in 3.6 s,
typecheck 5 s). Verification of the final branch (Quick gate run time, preflight behaviour with
`unpinned`, workflow validation) is recorded in the PR, not here. Implementation complete; not
deployed; the Production pin is unchanged. Outstanding manual step for Amit: once this change has
been deployed once under the current exact pin, set `DISTIL_PHASE3_PRODUCTION_SHA=unpinned` on
Vercel Production (optionally `DISTIL_PHASE3_REHEARSAL_SHA=unpinned` on Preview); every merge to
`main` then auto-deploys. Re-tighten at any time by setting the variable back to an exact SHA.
After the merge, run the Full gate once via `workflow_dispatch` before relying on the cron.

### /sign-in page released — 2026-09-16

PR [#12](https://github.com/amitsharmaak/distil/pull/12) squash-merged as `847a068`; exact-head
`main` gate passed. Release pin `DISTIL_PHASE3_PRODUCTION_SHA` updated to
`847a068c7a06ac11177d1e173a28c0a326a20f31` and `vercel deploy --prod` produced
`dpl_EP5sasTc2PWDzdgRRrGSmrHcZWRB` (preflight passed, Ready); `distil-pv-1850.vercel.app`
re-aliased. Verified on both origins: health 200; `/sign-in`, `/invite`, `/reset-password` 200;
an anonymous `/feed` request now redirects to `/sign-in`. Operational note: Amit added local
(gitignored) Claude Code permission rules so merges, release-pin updates, deploys and aliasing no
longer need a manual step; the exact-SHA gate itself is unchanged.

### Sign-in redirect fix released; dedicated /sign-in page — 2026-09-16

Release: Amit updated `DISTIL_PHASE3_PRODUCTION_SHA` to `ec9758a9d15157026fd52f05ab2fbc07f6800176`
after the exact-head `main` gate passed; Claude Code deployed with `vercel deploy --prod`
(`dpl_GYe6JtxFxX1NpydW6K7MmX2wrT6G`, preflight passed, Ready), re-aliased
`distil-pv-1850.vercel.app`, and verified health 200 plus the sign-in route on both origins.

Branch `claude/sign-in-page` (subagent implementation, reviewed and gated by Claude Code): new
public `/sign-in` page rendering the shared `src/components/auth/sign-in-card.tsx`; `/invite` is
invitation acceptance only and client-redirects to `/sign-in` when no fragment token is present;
every login destination (`loginUrl` in the proxy and the two completion routes, sign-out, reset
completion, access-denied link) now points at `/sign-in`; `/sign-in` added to the proxy public
paths with the CSRF boundary digest regenerated; the app shell renders no sidebar, topbar or
mobile nav on `/login`, `/sign-in`, `/invite`, `/reset-password` and `/access-denied` (this also
removes the prefetch source behind the earlier redirect bug); authorization matrix gains the
`/sign-in` page loader (22 pages). Locally verified: 201 suites / 1440 tests, `tsc`, lint (0
errors, 10 baseline warnings), Prettier.

### Password sign-in redirect fix — 2026-09-16

Smoke finding: on `distilai.app/invite`, a correct password produced no visible change. Vercel
runtime logs showed `POST /api/auth/sign-in/password` returning 200, so the provider accepted the
credentials and cookies were issued; the follow-up was `GET /invite`, never `GET /`. Cause: the
app shell renders the sidebar on `/invite`, whose links prefetch protected routes; the proxy
answers each anonymous prefetch with a redirect to `/invite`, which Next keeps in the client
router cache, so `router.replace("/")` resolved from that cache and stayed on the page. Fix:
after a successful password sign-in the page performs a full navigation through the new helper
`src/lib/browser-navigation.ts` (`navigateFullPage`), which re-evaluates `/` on the server with
the new session cookies. Tests updated (6 invite component tests); ESLint, Prettier and
TypeScript clean. Follow-up worth considering: exclude `/invite` and `/reset-password` from the
app shell so anonymous pages do not render or prefetch the authenticated navigation.

### Neon Auth password provider enabled — 2026-09-16

With Amit's authorization in chat, Claude Code used the connected Chrome session to open the Neon
console for project `distil-preview-db`, branch `distil-production` (`br-damp-wildflower-b3kw15cu`),
Auth, Configuration, and switched on "Sign-in with Email" (email + password). The console reported
"Authentication settings updated successfully" and the setting persisted after reload. Observed and
left unchanged: "Sign-up with Email" on, "Verify at Sign-up" off, no OAuth providers, trusted domain
`https://distilai.app` only, localhost off, shared email provider. "Sign-up with Email" stays
harmless for Distil because the application never forwards `sign-up/email` and unmapped provider
identities are denied by the proxy; it can be revisited if Neon's restricted-signup control ships.
No users, credentials or data were changed; the single existing user was not touched.

### Password login release — 2026-09-16

PR [#7](https://github.com/amitsharmaak/distil/pull/7) squash-merged to `main` as `7278326` on
2026-09-15 after every PR check passed; the exact-head `main` quality gate run
[34956048163](https://github.com/amitsharmaak/distil/actions/runs/34956048163) also passed. The
automatic Production deployment `dpl_EoyyjqQMmPmuNkYnkPzPKFwtxb9m` correctly failed the activation
preflight on the old release pin. Amit updated `DISTIL_PHASE3_PRODUCTION_SHA` to
`72783268f3df5a6461f009d8f0cfc2a029af81ec`; Claude Code then deployed with `vercel deploy --prod`,
producing `dpl_37haDb3zFz1moUGpw7LS7JECyyBH` (preflight passed, build 56 s, Ready). `distilai.app`
received the production alias automatically; `distil-pv-1850.vercel.app` was re-aliased explicitly.

Locally verified on 2026-09-16 against both origins: `/api/health` 200 with `cache-control:
no-store`, `/reset-password` 200, and `POST /api/auth/sign-in/password` and
`POST /api/auth/password/reset` return 403 without an allowed Origin (route present, origin check
active). No sign-in, reset, capture or provider call was made; the library was not touched. The
Neon Auth email/password provider setting was not changed or inspected. Local `git` and the two
worktrees were reconciled: `main` checkout at `7278326`; `claude/ui-simplification` worktree left
untouched.

### Password login — 2026-09-11

Branch `claude/password-login` (worktree `/Users/amitsharma/Projects/distil-password-login`, from
`origin/main` at `780538b`). Integrated by Claude Code from three parallel subagent tasks with
non-overlapping file ownership (server routes, UI, inventory/docs), then reviewed and gated by the
main session. Requested by Amit: a password login option alongside magic links, no 2FA yet.

**Design.** The hosted Neon Auth credential provider is used through Distil-gated routes; Distil
stores no password material and issues no second session type, so the proxy, tenancy and device
revocation paths are unchanged. `src/lib/auth/password-login.ts` holds the dependency-injected
handlers and `neonPasswordProvider`, which calls the SDK handler internally for `sign-in/email`,
`request-password-reset`, `reset-password` and `change-password` and forwards only `response.ok`
and Set-Cookie headers. New routes: `POST /api/auth/sign-in/password` (active mapped email
required before provider dispatch; generic 401 otherwise; per-IP and per-account limits 10 per
15 min), `POST /api/auth/password/request-reset` (always 202; per-IP limit 5 per 15 min; provider
redirect fixed to `/reset-password`), `POST /api/auth/password/reset` (one-time provider token),
`POST /api/auth/password/change` (owner scope, origin check in the route file, revokes other
sessions). Minimum password length 12 in schemas and forms. A first password is set through the
emailed reset link because Better Auth's set-password is server-only. UI: `/invite` now shows
email + password sign-in with "magic link instead" and a link to the new public `/reset-password`
page; the account center gained a password change form and a "password setup link" button.
`/reset-password` was added to the proxy's public paths; the reviewed CSRF boundary digest was
regenerated. `docs/adr/0004-password-login.md` records the decision; `AGENTS.md`, `README.md`,
the activation runbook and `docs/authorization-matrix.json` (92 route files, 21 pages, 54 owner
mutations) were updated with the new surfaces. The legacy `/login` page and the `[...path]`
catch-all allow-list are unchanged; `sign-up/email` is still never reachable.

**Locally verified on 2026-09-11 in the worktree:** `npx tsc --noEmit` clean; `npm test` 198
suites / 1427 tests passed (includes 31 new handler security tests, 9 route tests, 14 component
tests, and the authorization inventory and CSRF boundary harness); `npm run lint` 0 errors and the
10 baseline warnings, all in untouched files; Prettier clean on every changed file. Not run:
PostgreSQL integration, E2E, `npm run build`, any request against the hosted provider.

**Not verified and must be checked at release:** the hosted provider's behavior for accounts that
exist without a credential (reset creating the credential account) and the exact reset-link URL
shape (`/reset-password?token=...` is assumed; `?error=` is handled). The Neon Auth project must
have email/password enabled before the routes work; that is a cloud change for Amit.

### UI simplification — 2026-09-11 (integrated 2026-09-16)

Branch `claude/ui-simplification` (`414a700`, PR
[#8](https://github.com/amitsharmaak/distil/pull/8)), authored on 2026-09-11 from `main` at
`780538b` and integrated into `main` on 2026-09-16 together with the tiered testing work (see the
"Integration of tiering and UI simplification" checkpoint above). The text below is the branch's
own record, kept as evidence.

- **What changed and why:** the design critique found the shell contradicted the "calm reading"
  intent: 8 mobile tabs at 10px, four fixed chrome layers on the reader, three search entry
  points, two Ask surfaces, six Settings tabs, ~10 feed controls.
  - Mobile tab bar: Today, Feed, Save, Settings (12px labels). Desktop sidebar: Today, Feed,
    Search, Ask, Save, Settings (Search/Ask still flag-gated).
  - Top bar: date, a search icon linking to `/search`, icon-only theme toggle (mobile gains a
    theme control). Removed: search-on-type input, the agent Sheet, the notification bell and its
    30s polling. `ThemeToggle` takes an optional `className`.
  - Reader (`/feed/[id]`): `AppShell.isReaderPath` drops the mobile tab bar and the nav padding,
    passes `backHref="/feed"` to `Topbar`; the page's own sticky Back strip is gone and
    `DetailActionBar` sits at `bottom-0` on every breakpoint.
  - Settings: two tabs, Capture (`TokenSettings`) and Account (links to `/account`, `/digests`,
    `/collections`, `/archive`). Agent, Topics, Notifications, Email Intelligence tabs removed
    from the page; their APIs are untouched.
  - Feed toolbar: sort select + Unread/All inline on every breakpoint; priority/source/type/topic/
    collection, archive, dates and card/compact layout live in the Filters bottom sheet. Props of
    `FeedFilters` unchanged.
  - Feed page: an API error or a payload without `items` now renders a "Feed is unavailable" card
    instead of crashing on `items.some` (the crash reproduced locally on an unauthenticated
    session).
  - Tests rewritten for mobile-nav, sidebar, topbar, app-shell (reader-route cases added), feed
    page (error and empty-payload cases; network failure now expects the error card, not the
    empty state); `tests/e2e/phase2.spec.ts` no longer expects Digests in navigation.
- **Decision:** Amit chose "unlink only": `/topics`, `/sources`, `/research`, `/digests`,
  `/collections`, `/archive` and the removed Settings tabs stay routable and their code stays in
  the tree; `/topics`, `/sources` and `/research` now have no inbound links and are deletion
  candidates.
- **Verification on the branch (locally verified on 2026-09-11, before integration):**
  `npx tsc --noEmit` passed; `npm run lint` passed (0 errors, pre-existing warnings only); full
  `npm test` passed (195 suites / 1377 tests); visual check of Today, Feed, Settings at 375px and
  Feed at desktop on a worktree dev server with all Phase 2 UI flags on. `npm run test:e2e`
  (flags off, as in CI) passed 27 / 3 skipped across desktop-chromium, mobile-chromium and
  mobile-webkit. The flags-on variant of `tests/e2e/phase2.spec.ts` (never run in CI) passes its
  navigation assertions but fails at its final `/feed/phase2-fixture` step with a server-side
  `AccessDeniedError`; the same step fails identically on unmodified `main` at `780538b`, so it is
  a pre-existing gap in that spec, not a regression. Not run on the branch: PostgreSQL
  integration, build. Verification after integration with current `main` is recorded in the
  integration checkpoint above.

### Documentation reconciliation — 2026-09-11

Branch `claude/agent-guidance-bootstrap`, integrated by Claude Code from four bounded subagent
tasks with non-overlapping file ownership. Changes: `README.md`, `CONTRIBUTING.md` and
`scripts/setup.sh` rewritten for the PostgreSQL/Neon/Vercel system (no more SQLite, `.env.example`,
Slack bot-token or generic-host claims; `setup.sh` now writes an empty-valued `.env.local`
template). `docs/ARCHITECTURE.md` restructured into a verified hosted-architecture section and a
clearly labeled legacy compatibility section; FTS5/`pendingIngestions`/CORS-wildcard claims removed.
Dead `db:generate` and `db:check` scripts removed from `package.json` (no `drizzle.config.ts`
exists; `drizzle-kit` devDependency kept). CI workflow renamed "Quality gate"; job ids and the
`quality-gate` check name are unchanged so branch protection still matches.

One runtime change: `src/lib/sync-scheduler.ts` now imports the legacy SQLite module lazily, so
better-sqlite3 no longer opens a database file at boot on hosts where the scheduler is disabled.
`src/lib/notifications.ts` was left as is because nothing imports it. Locally verified:
TypeScript, ESLint on the changed file, `src/lib/__tests__` (6 suites / 63 tests), Prettier on all
changed files. Not run: full Jest, PostgreSQL integration, E2E, production build; CI must supply
those before merge.

PR [#4](https://github.com/amitsharmaak/distil/pull/4) first CI run
[34570240172](https://github.com/amitsharmaak/distil/actions/runs/34570240172) passed seven jobs
and failed only the coverage gate: the 12 changed scheduler lines had 0% coverage against the 80%
changed-code threshold. `src/lib/__tests__/sync-scheduler.unit.test.ts` was added (6 tests: no
tokens, stale and recent last-sync for Gmail and Slack, disabled interval, double start, Gmail
failure not blocking Slack), mocking the legacy SQLite module so better-sqlite3 never loads. Local
file coverage is 88.9% lines; TypeScript, ESLint and Prettier pass. The re-run
[34583940690](https://github.com/amitsharmaak/distil/actions/runs/34583940690) passed all eight
jobs, and Amit squash-merged the PR as `69b0e04` on 2026-09-11. Not deployed; no release needed.

### Reading-loop bug fixes — 2026-09-11

Branch `claude/bug-content-search`, two subagents with disjoint file ownership, integrated by
Claude Code. `BUG-CONTENT-001`: Today passed the stored Markdown summary straight to a text node
(`src/components/phase2/today-experience.tsx`), and search excerpts came verbatim from chunk content,
which is Readability HTML (`src/lib/knowledge/retrieval.ts`). A pure `toPlainText()` helper in
`src/lib/format.ts` now strips tags, decodes entities and removes Markdown syntax; it is applied to
the search excerpt and the Today summary. Stored data is unchanged. `BUG-SEARCH-001`:
`src/components/phase2/search-experience.tsx` gains a `role="status"` line under the form
(Searching / N results / error), a collapsible Filters panel that starts collapsed under 640px,
and scroll-plus-focus to the results heading on completion, respecting reduced motion.

Locally verified: TypeScript, ESLint and Prettier on all changed files; focused Jest 4 suites /
27 tests; the content agent's full deterministic run passed 170 suites / 1,199 tests; changed-file
coverage is above the 80% gate. Not run: E2E, PostgreSQL integration, build; CI supplies those.
Not deployed. Both bugs move from the deferred backlog to fixed once the PR merges.

## Current cross-phase status

This file on `main` is the authoritative cross-phase state. The dedicated Phase 1, Phase 2, and
Phase 3 branches retain their historical implementation records; completed integration work is
normalized onto `main` for all subsequent development and Production releases.

- **Phase 1: complete.** All seven tasks are closed. Its original Preview-only closure remains the
  historical acceptance decision; the separately approved clean-start Production release is now
  live as part of the Phase 3 activation recorded below.
- **Phase 2: complete.** The reviewed tenancy-aware forward-port is frozen at
  `933ad10aa94c35a72a8eb647f8170447f43d092e`. The user accepted the physical-device evidence and
  explicitly deferred `BUG-IOS-002`, anchored highlighting from touch selection, to the non-blocking
  backlog. Semantic/vector retrieval and sophisticated multi-provider failover remain optional Phase
  2.x enhancements.
- **Phase 3: complete and live in Production.** Wave 4 remains frozen at
  `b93c2bac47f1fd46d83e9c05b05b3d644e768927`; clean-start Production activation and its focused
  first-user smoke are complete at release SHA `28a48f4211a142d5efe3e2744acf83acf5bc2262`.

The custom-domain cutover to `https://distilai.app` is complete. Amit confirmed returning-user
magic-link sign-in and Today on the new origin, and Neon Auth now trusts only the new apex domain.

Repository normalization completed on 2026-09-10 by fast-forwarding `main` from `6852686` through
the complete `codex/phase-3-tenancy` history at Production-closure checkpoint `0d00e6b`. The phase
branch remains as historical evidence, but `main` is now the integration and release branch.

The post-freeze PostgreSQL verification blocker is **resolved** at
`874d55637da661b9a6cb29b63628ec79ba3c79af`. GitHub Actions run
[34345277490](https://github.com/amitsharmaak/distil/actions/runs/34345277490) passed all eight
quality gates for that exact SHA, including PostgreSQL integration and web/mobile E2E.
Runs [34342210217](https://github.com/amitsharmaak/distil/actions/runs/34342210217), `34341305538`,
and `34338696318` failed the invitation-dispatch concurrency case because its fixture used the
fixed expiry `2026-09-09T09:00:00Z`. Once CI's database clock passed that instant, the repository
correctly rejected every claim as expired. The fixture now derives its expiry from PostgreSQL's
`statement_timestamp()`, keeping the test focused on atomic admission rather than wall-clock age;
production invitation-dispatch logic is unchanged. Local verification passes every PostgreSQL
integration suite, all 131 unit suites / 942 tests, TypeScript, formatting, and lint with the same
10 known warnings and zero errors. The current implementation branch is green; keep rollout flags
false because activation and promotion remain separately approved operational steps.

Hosted-auth activation preparation has started at `a8a0947310fb0bd9a6208d238457d4e7c3e03679`
without changing any cloud resource or rollout flag. A new fail-closed build preflight restricts
the first activation rehearsal to an explicitly SHA-bound, synthetic, unpromoted Preview with
exact HTTPS origins, separated database roles, all unrelated flags false, and no legacy owner.
`docs/runbooks/phase3-auth-activation.md` is the operator sequence. The first incomplete step is to
provide two accessible synthetic test inboxes, then create the disposable Neon/Auth branch and
unpromoted Vercel deployment; do not use a real identity as a shortcut.
GitHub Actions run
[34346570029](https://github.com/amitsharmaak/distil/actions/runs/34346570029) passed every quality
job for exact state checkpoint `4874c1d6ca50fe7745b484387f55e77fe6b2e67b`.

### Production library reset — 2026-09-10

At Amit's explicit request for a clean slate before adding content incrementally, the Production
library on Neon branch `br-damp-wildflower-b3kw15cu` (`distil-production`, project
`floral-river-70536503`) was cleared in one database transaction. The operation removed 3 items,
6 capture receipts, 3 raw responses, 4 content versions, 199 chunks, 4 intelligence artifacts and
4 knowledge-backfill checkpoints. All 32 targeted content/processing tables were verified empty,
including summaries, notes, highlights, collections, digests, research, chat and job queues.
The preflight found no queued/processing captures and no account exports.

Account identity, hosted authentication, the existing capture token, invitations, preferences,
settings, security/usage accounting and migration records were preserved. No application code,
deployment, Preview data or provider configuration changed. No new captures were submitted during
verification. Next: add one item at a time and check capture, readable extraction, summary and search;
the separately observed summary API failure remains unresolved by this data reset.

### Summary reliability repair — 2026-09-10

The screenshot's summary request returned HTTP 500 on the old Vercel-origin deployment
`dpl_DX7YbDtESu2kCJ5vsAgQU8zQ8yD7` at `ba303400`; its log omitted the underlying SDK error.
Live inspection found `distilai.app` on `ebbd9fb`, while the old Vercel origin still served the
older deployment. The original historical failure cannot be classified retroactively.

The current tenant-aware summary path had lost the earlier native structured-output and
model-quota fallback protections. PR [#3](https://github.com/amitsharmaak/distil/pull/3), merged at
`e753d2ca5a0a6cae936a34cd79db85b641098425`, restores native Gemini JSON,
validates required summary fields before caching, and performs a separately budget-admitted
same-provider fallback to `gemini-3.1-flash-lite` on quota, timeout or service failure. Each summary
model attempt has a 15-second timeout; cache and audit metadata use the actual successful model.
Sanitized error codes distinguish provider failures from tenant budgets without exposing payloads.
Reader failures preserve original/cached content; retry retains the failed length and force flag.

A synthetic summary using the local Gemini credential and the actual restricted Production
database role reproduced a primary-model timeout and succeeded through the fallback. All test
database writes were rolled back; no library item was inserted. The separate Production provider
credential is protected and was not read or changed. All 56 focused regression tests and TypeScript pass. The final accounting check restores the
previously accepted fallback model rates (USD 0.25/M input tokens and 1.5/M output tokens). Full exact-head CI passed at
`75db750f856954476366d34e01437dd1fad10159` in runs
[34479213836](https://github.com/amitsharmaak/distil/actions/runs/34479213836) and
[34479217348](https://github.com/amitsharmaak/distil/actions/runs/34479217348), including PostgreSQL,
security, web/mobile and extension E2E, and the Production build. Changed coverage was 95.7% of
lines and 93.3% of branches. Lint has the same 10 warnings and zero errors. The two first-run
formatting findings were corrected before merge.

Release uses the existing exact-SHA Production gate: a main commit must pass CI before updating
`DISTIL_PHASE3_PRODUCTION_SHA` and redeploying that commit. The first automatic deployment of the
merge correctly stopped on the old release pin. Documentation-only checkpoint commits contain
no further runtime changes. Both the custom domain and legacy Vercel alias must resolve to the
released deployment so extension traffic cannot use the obsolete code. Next product verification
is one deliberate user capture on `https://distilai.app`; preserve the empty library until then.

Production acceptance: release `5f45bba75aa2054fbaf909f31579a9bc8dcae999` passed every job in
[34480071134](https://github.com/amitsharmaak/distil/actions/runs/34480071134). After updating the
release pin, deployment `dpl_74mhi6F5kw8Dcx2Au57UEjg9X7P1` reached Ready. Both `distilai.app` and
`distil-pv-1850.vercel.app` were explicitly assigned to it and returned health 200 with
`cache-control: no-store`. Post-release verification found zero items, capture receipts, raw
responses, chunks and summaries; one user and the existing capture token remain intact. No test
item was created. The browser was left at the canonical site's sign-in page; the operator must
sign in there before the first deliberate fresh capture. The original screenshot's provider cause
remains unavailable in historical logs; the reproduced timeout recovery and new diagnostics are
verified as described above. Documentation-only descendants contain the same accepted runtime code.

## How to use this file

At the start of a new session:

1. Read this file and verify the recorded branch, worktree, commit, and external-resource state.
2. Confirm any time-sensitive external state before acting; do not assume a local server or cloud
   deployment is still running.
3. Resume from the first incomplete item under the active phase's next execution sequence.

Whenever material work is completed, update the date, implementation/test evidence, external
resource state, decisions, blockers, and next steps, then commit the update on the active integration
branch. Keep secrets out of this file and record only variable names and masked resource metadata.

## Distil's higher-level goal

Distil should become a trusted personal and shared knowledge-consumption system: one place where a
person can capture information from anywhere, have it distilled into useful knowledge, find it
again, and eventually share selected knowledge with other people.

The product is not merely a collection of integrations and it is not an unread-items warehouse.
Connectors, browser extensions, Share Sheets, and APIs are acquisition channels. Their purpose is to
feed a coherent knowledge experience that helps the user spend less time collecting and sorting
information and more time understanding and acting on what matters.

The long-term experience is:

```text
Capture from anywhere
        |
        v
Durably ingest and understand
        |
        v
Deduplicate, summarize, organize, and prioritize
        |
        v
Read one calm, personalized knowledge feed
        |
        v
Search, ask, connect ideas, and revisit knowledge
        |
        v
Optionally share with people and workspaces
```

Distil should be available through a responsive browser application and a first-class mobile
experience. A user should be able to save from iPhone Chrome and other apps without opening Distil,
then consume the result on any signed-in device. As the product becomes multi-user, every item,
setting, credential, job, search result, and AI context must be correctly isolated by user and,
where applicable, workspace.

## Core user jobs

1. **Capture without friction.** Save an article or useful URL from desktop or mobile in a few
   seconds and trust that it will not be lost.
2. **Consume without overload.** Open Distil and see a concise, prioritized view of what is worth
   reading, with the original source always available.
3. **Understand quickly.** Receive reliable summaries, topics, entities, key claims, and reasons for
   relevance rather than a pile of raw links.
4. **Recall and synthesize.** Search semantically, ask questions over saved knowledge, follow
   citations, and discover connections across items.
5. **Control sources and privacy.** Decide what enters Distil, which AI provider may process it, and
   which devices, tokens, people, or workspaces can access it.
6. **Share deliberately.** Later, share selected items, collections, annotations, and insights
   without exposing the rest of a personal library.

## Product principles

- **The knowledge experience is the product.** Gmail, Slack, RSS, browser capture, and other
  connectors are replaceable inputs, not the center of the product.
- **Capture must be durable.** A success response means the request is persisted and queued; work
  must not depend on server timers or fire-and-forget promises.
- **Trust before autonomy.** Show sources, status, errors, and reasons. Require approval for risky
  actions and earn the right to automate more over time.
- **Mobile capture before a native mobile build.** Validate the end-to-end habit with the PWA,
  iPhone Shortcut, and Share Sheet first; build a native app when the core workflow is proven.
- **Selective connectors.** Add a source only when it brings high-signal knowledge that users would
  otherwise miss. Prefer simpler feeds, forwarding, or explicit capture over broad mailbox or
  workspace surveillance.
- **Isolation by construction.** Multi-user support requires ownership in the schema and every
  repository query, not only route-level filters.
- **AI features require evaluation.** Measure summary faithfulness, retrieval quality, preference
  accuracy, latency, and cost; graceful non-AI behavior should remain possible.
- **Privacy and reversibility are defaults.** Minimize stored secrets, make tokens revocable, keep
  imports auditable, and preserve rollback paths.
- **One ingestion contract.** Every acquisition channel should converge on the same normalized,
  secure, observable processing pipeline.

## North-star outcomes and measures

Exact targets should be calibrated with real use, but each phase should improve these outcomes:

- Median time from Share Sheet or extension action to a durable receipt.
- Percentage of captures that reach `ready` without intervention.
- Median and high-percentile time from capture to usable distillation.
- Duplicate rate visible to users and false-positive deduplication rate.
- Weekly saved items that are subsequently read, searched, referenced, or shared.
- Summary faithfulness and user-rated usefulness.
- Search/answer success with traceable citations.
- Feed precision: how often the highest-ranked items are actually useful.
- Seven-day and thirty-day retention around the capture-to-consumption habit.
- Cost per processed item and per active user.
- Cross-tenant data leaks, unauthorized access, and lost accepted captures: target zero.

## Target product and technical shape

```text
Clients
  Web app / installed PWA / iOS Share extension or Shortcut / browser extension
                                |
Identity and access             v
  users, sessions, device tokens, workspace membership, roles
                                |
Unified APIs                    v
  captures, items, feed, search, questions, settings, connectors
                                |
Durable processing             v
  queue -> fetch -> extract -> classify -> summarize -> embed -> index
                                |
Knowledge layer                v
  PostgreSQL, full-text/vector retrieval, citations, feedback, audit trail
                                |
Experiences
  personal feed, reader, recall, briefings, shared collections/workspaces
```

PostgreSQL is the system of record. Background jobs are durable and idempotent. Storage and queues
must remain portable behind application contracts even when Neon and Vercel provide the initial
hosted implementation. Clients use versioned APIs and never receive server/database credentials.

## Master phased roadmap

The phases are ordered to validate the riskiest user behavior before adding breadth. Phase numbers
describe product maturity, not fixed calendar dates. A later phase should not start broadly until
the preceding exit gate is met, although research and prototypes may run ahead.

### Phase 1 — Personal cloud capture and multi-device foundation (complete)

**Goal:** Make one user's Distil library securely available in the cloud and make article capture
reliable from desktop and iPhone.

**Deliverables:**

- Establish the direction, baseline, and quality foundation: characterize the existing feed, AI
  pipeline, connectors, extension, research, and SQLite behavior; define deterministic test suites;
  record product, privacy, security, cost, and architectural assumptions.
- Move the system of record from local SQLite to PostgreSQL with verified migration/import tooling.
- Protect the web application with a signed single-user session and protect capture clients with
  separate, hashed, revocable tokens.
- Add one secure capture API, durable receipt state machine, SSRF defenses, rate limits, queue-backed
  processing, idempotency, retry, and failure visibility.
- Provide `/save`, responsive/PWA behavior, an iPhone Shortcut workflow, and a reliable browser
  extension with offline replay.
- Deploy to a Preview environment on Vercel and Neon, test real captures, then promote only after the
  complete quality and security gates pass.
- Keep hosted Gmail, Slack, RSS, native mobile, and multi-user behavior disabled.

**Exit gate:** The application is characterized by repeatable quality and security tests, and a real
user can sign in from browser/mobile, save from Chrome and other iPhone apps, see every accepted
capture reach a correct terminal state, revoke either client independently, and recover from
failures without duplicates or lost work. The Preview deployment and API-level capture acceptance
are complete. The accepted physical-device scope and deferred bug backlog are recorded below.
Phase 1 closed in Preview-only mode on 2026-09-09; Production was not promoted.

### Phase 2 — Daily knowledge experience and intelligence quality (complete)

**Goal:** Turn reliable capture into a habitually useful reading, recall, and sense-making product.

**Deliverables:**

- Refine the feed around priority, unread state, topics, source, recency, and user intent.
- Improve the reader view, saved notes, annotations, collections, resurfacing, and archive workflows.
- Build hybrid full-text and semantic retrieval over user-owned items, with cited answers and clear
  links back to sources.
- Make summaries and extracted claims traceable, regenerate-able, and visibly degraded when AI is
  unavailable.
- Use explicit feedback and observed behavior to personalize ranking without creating an opaque
  filter bubble; provide controls and explanations.
- Add evaluation sets for extraction, summary faithfulness, retrieval, ranking, latency, and cost.
- Add useful notifications/digests only where they support consumption rather than create another
  noisy inbox.

**Exit gate:** Captured knowledge is regularly consumed or recalled; search and answers are grounded
with citations; quality and cost regressions are measurable; users can understand and correct the
system's decisions.

### Phase 3 — Multi-user web application and tenant isolation (implementation accepted)

**Goal:** Move from a protected single-user deployment to real accounts while preserving strict data
isolation and personal ownership.

**Deliverables:**

- Introduce a supported identity provider or passwordless authentication, account recovery, verified
  email, session/device management, and account deletion/export.
- Add `user_id` ownership to all personal data and `workspace_id` where shared scope is intended.
- Enforce tenant scoping in repository contracts, database constraints/policies, caches, queues,
  search indexes, AI context assembly, logs, rate limits, and object storage.
- Migrate the Phase 1 single-user dataset into the first real account with audited verification.
- Provide onboarding, per-user settings, tokens, quotas, usage visibility, and privacy controls.
- Add adversarial cross-tenant tests and an authorization matrix covering every route and worker.
- Define backup, restore, data portability, deletion, abuse handling, and support procedures.

**Exit gate:** Multiple unrelated users can use the web application concurrently with zero
cross-tenant access; account lifecycle and data export/deletion work; queues and AI retrieval always
retain tenant context; security review and tenant-isolation tests pass.

### Phase 4 — First-class mobile application

**Goal:** Deliver a mobile experience for both effortless capture and high-quality consumption,
building on the proven Phase 1 API rather than duplicating backend logic.

**Deliverables:**

- Use Phase 1 PWA/Shortcut telemetry and feedback to choose native iOS, a cross-platform client, or a
  staged combination; prioritize iOS because the initial device is an iPhone 14 Pro Max.
- Implement secure mobile authentication, Keychain-backed credentials, token rotation, logout, and
  remote session revocation.
- Add a native Share extension that accepts URLs/text from Chrome and other apps, acknowledges
  durable capture quickly, and works through intermittent connectivity.
- Provide mobile feed, reader, search, collections, notes, capture status, and retry UX.
- Support offline reading and queued user actions with explicit conflict behavior.
- Add carefully controlled push notifications for completed captures, briefings, or chosen topics.
- Establish device E2E coverage, beta distribution, crash reporting, accessibility, and App Store
  privacy disclosures.

**Exit gate:** Mobile users can capture, consume, search, and manage knowledge without relying on the
desktop app; offline/reconnect behavior is reliable; credentials stay device-secure; beta retention
shows the mobile workflow is valuable.

### Phase 5 — Selective sources, connectors, and automations

**Goal:** Expand ingestion only where a source adds high-signal knowledge and improves retention.

**Deliverables:**

- Evaluate sources in increasing order of privacy and complexity: RSS/Atom and newsletters or email
  forwarding first, narrowly scoped Gmail next, Slack/team sources only with a clear use case.
- For every connector, define consent, minimum scopes, source filters, sync cursor, backfill limits,
  deduplication, revocation, deletion, retry, cost, and audit behavior.
- Route all connector items through the same capture/intelligence contracts rather than source-
  specific processing paths.
- Give users source-level controls, preview-before-import options, pause/disconnect, retention, and
  visibility into why an item was included.
- Measure signal-to-noise, consumption, retention lift, processing cost, and privacy/support burden.
- Add scheduled briefings or topic monitoring only after ingestion relevance is demonstrated.

**Exit gate:** Each enabled connector demonstrably adds useful consumed knowledge at an acceptable
privacy and operational cost. Gmail and Slack are retained only if real evidence clears that bar;
otherwise they remain disabled or are removed from the hosted product.

### Phase 6 — Shared knowledge and collaboration

**Goal:** Let users collaborate deliberately without turning every personal library into a shared
workspace.

**Deliverables:**

- Add workspaces, invitations, membership lifecycle, owner/admin/member/viewer roles, and explicit
  boundaries between personal and shared content.
- Support selective sharing of items, collections, annotations, digests, and cited answers.
- Add workspace search and AI synthesis that uses only authorized shared context.
- Provide audit trails, moderation/reporting, retention controls, notification preferences, and
  protection against accidental oversharing.
- Define ownership and behavior when a user leaves, a workspace is deleted, or an item is unshared.
- Add concurrency/conflict handling for collaborative metadata and annotations.

**Exit gate:** A small group can build and query a shared knowledge space with understandable roles,
complete access revocation, no leakage from personal libraries, and acceptable notification noise.

### Phase 7 — Scale, reliability, governance, and sustainable operation

**Goal:** Make Distil dependable and economically sustainable as usage, customers, and processing
volume grow.

**Deliverables:**

- Define service objectives for capture durability, processing latency, availability, and recovery.
- Add queue observability, dead-letter/replay operations, circuit breakers, provider failover,
  capacity controls, and tested disaster recovery.
- Scale PostgreSQL connections, indexes, search/vector storage, data lifecycle, and regional strategy
  based on measured demand.
- Add usage metering, per-user/workspace quotas, AI budgets, abuse prevention, billing readiness, and
  plan entitlements if Distil becomes commercial.
- Automate privacy requests, retention, audit exports, incident response, dependency/security review,
  and compliance work appropriate to the market.
- Continuously run product, security, reliability, and AI-quality evaluations with regression alerts.

**Exit gate:** Growth does not cause lost captures, unsafe data access, uncontrolled AI cost, or
unrecoverable operations; the product has tested runbooks and a sustainable service model.

## Roadmap decision rules

- Distil uses Phase numbers **1 through 7**. There is no Phase 0 and no Phase 8 in this roadmap.
- Baseline analysis and testing architecture are foundation work inside Phase 1.
- Phase 2 implementation was allowed to proceed in isolated branches, worktrees, databases, and
  Preview deployments while Phase 1 acceptance continued. Phase 1 is now closed Preview-only; any
  stable Preview or Production promotion remains a separate explicit release decision.
- Do not add full Gmail or Slack hosting merely because code already exists; validate the source's
  user value and scope first in Phase 5.
- Do not expose the application to additional users until Phase 3 tenant ownership and isolation are
  complete.
- Do not let a native client bypass the versioned APIs, durable capture contract, or revocable device
  credentials.
- A phase may be split into smaller releases, but its exit gate must remain explicit and testable.
- Revisit ordering only when user evidence changes priorities; record the reason and affected risks in
  this file.

---

## Phase 1 execution record (complete)

This section records the completed Phase 1 implementation and deployment work.

### Phase 1 goal and scope

Phase 1 turns Distil into a secure, single-user application that can capture an article from several
clients and process it through one durable backend:

```text
Browser / iPhone Shortcut / browser extension
                    |
                    v
           authenticated capture API
                    |
                    v
          durable capture receipt + queue
                    |
                    v
       fetch -> extract -> summarize -> store
                    |
                    v
             PostgreSQL-backed feed
```

The intended capture sources are the web save page, an iPhone Shortcut usable from Chrome and other
iOS Share Sheets, and the browser extension. Phase 1 remains single-user. Gmail, Slack, RSS, native
mobile apps, multi-user accounts/workspaces, and hosted connector synchronization are explicitly out
of scope.

### Git and workspace state

- Integration branch: `codex/phase-1-personal-capture`
- Integration worktree: `/private/tmp/distil-phase1-root`
- Phase 1 implementation baseline commit: `c0807b1`
- Initial handoff-document commit: `42fc454`
- Current deployed implementation commit: `a8420a1`
- Current accepted Task 2 release commit: `6714a1c6cd84a3cae925860b84409ed56de3824c`
- Git remote: `git@github.com:amitsharmaak/distil.git`
- The Phase 1 branch is published to GitHub and tracks `origin/codex/phase-1-personal-capture`.
- The original checkout at `/Users/amitsharma/Projects/distil` remains on `main` and has user-owned
  changes: a modified `package-lock.json` and an untracked `.nvmrc`. Do not stash, discard, overwrite,
  or include those changes in Phase 1 work.

All further Phase 1 implementation, tests, commits, migration commands, and deployments should run
from `/private/tmp/distil-phase1-root` unless the worktree layout is deliberately changed.

### Implementation completed

The branch contains the Phase 1 application and infrastructure work, including:

- A deterministic test architecture for unit, component, contract, PostgreSQL integration, SQLite
  compatibility, security, browser/mobile E2E, extension E2E, coverage, and opt-in live checks.
- Asynchronous repository contracts and async application/domain database access.
- Drizzle PostgreSQL schema, migrations, row mapping, repositories, and repository contract tests.
- A dry-run-by-default SQLite importer with explicit `--execute`, transactional verification, and
  source preservation.
- Password login, signed sessions, logout/session APIs, origin enforcement, database-backed rate
  limiting, and independently revocable capture tokens.
- Durable capture receipts, URL normalization and SSRF protection, capture state transitions,
  idempotent queue messages, retry handling, and duplicate delivery protection.
- Capture APIs under `/api/v1/captures` and token APIs under `/api/v1/capture-tokens`.
- Protected pages and APIs plus delegation of legacy `POST /api/items` capture behavior.
- Mobile `/save` experience, PWA metadata, iPhone safe-area behavior, and the iPhone Shortcut
  instructions in `docs/iphone-shortcut.md`.
- Browser extension token/origin configuration, offline deduplication, restart persistence, replay,
  and response-specific retry behavior.
- Vercel Queue configuration, hosted connector shutdown, explicit migrations, a health endpoint,
  and the deployment/rollback runbook in `docs/vercel-deployment.md`.
- Adversarial security, failure-path, database, queue, capture, and coverage tests.

The latest deployment corrections move test-only state out of the Next.js route module, make every
function duration Hobby-compatible, strip legacy NUL bytes during SQLite import, pin a
Vercel-compatible article parser, and lazy-load the local-only Playwright publisher runtime.

### Test and review status

The most recently completed local verification (Task 2 candidate, 2026-09-07) reported:

- Deterministic Jest suite: 551 passing tests.
- Security suite: 112 passing tests.
- Browser/mobile E2E: 24 passing tests.
- Browser extension E2E: 10 passing tests.
- Changed executable code coverage: 82.3% lines and 85.4% branches relative to `main`.
- Critical auth, capture, queue, URL-safety, and migration modules: above the 90% coverage gate.
- Lint, formatting, TypeScript, changed-line coverage, and production build: passing.

PostgreSQL Testcontainers could not be executed in the local environment because a Docker runtime
was unavailable. The harness and tests exist, but that Docker-backed gate still needs one clean run
on a host or CI runner with Docker. Hosted services are excluded from deterministic tests.

Before promotion, rerun `npm run test:ci` and the PostgreSQL integration suite in a Docker-capable
environment. Do not reinterpret the stored counts as a substitute for a fresh release run.

### Local application status

The Phase 1 application was successfully built and exercised locally. The previous process on
`http://127.0.0.1:3100` was stopped for the release build. Start it again from the integration
worktree when needed:

```bash
cd /private/tmp/distil-phase1-root
npm run dev -- --hostname 127.0.0.1 --port 3100
```

### Vercel account and project

- Vercel account/team display: `PV Hobby`
- Team slug: `pv-1850`
- Plan: Hobby (free; personal/non-commercial use)
- Vercel project: `project-evgf1`
- Project dashboard: `https://vercel.com/pv-1850/project-evgf1`
- Project state: CLI-linked to the Phase 1 worktree with a ready Preview deployment. The Phase 1
  branch is published to GitHub, but the repository is still not connected to Vercel and Production
  has not been deployed.
- GitHub branch: `https://github.com/amitsharmaak/distil/tree/codex/phase-1-personal-capture`
- Stable Preview URL: `https://distil-preview-pv-1850.vercel.app`
- Current immutable deployment: `dpl_4XZdkSDZBaEnarsz5HdbJkDk2pEi`
- Deployment inspector: `https://vercel.com/pv-1850/project-evgf1/4XZdkSDZBaEnarsz5HdbJkDk2pEi`
- Intended application region: Singapore (`sin1`).
- Git repository has not yet been connected to the Vercel project.

Vercel Queues is available on Hobby. The capture consumer and dormant local-only publisher login
route are capped at 60 seconds. A real Preview capture completed through the queue in one attempt
within that budget.

### Neon database

- Resource name: `distil-preview-db`
- Plan: Neon Free; no credit card was required.
- Region: Singapore (Southeast), `sin1` in the Vercel integration UI.
- Connected Vercel project: `project-evgf1`.
- Connected environment: Preview only. Production and Development were left disconnected.
- Preview deployment database branching was left disabled.
- Resource status at creation: Available.

The integration created masked connection variables including:

- `DATABASE_URL`: pooled runtime connection.
- `DATABASE_URL_UNPOOLED`: direct/unpooled connection for migrations and imports.
- Additional Neon/Postgres compatibility variables managed by the integration.

The application expects the unpooled release URL under `DATABASE_MIGRATION_URL`; that Preview secret
is now mapped from `DATABASE_URL_UNPOOLED`. Runtime requests remain on pooled `DATABASE_URL`, while
migrations and imports use the unpooled URL.

Migration `0001_phase1.sql` has been applied. The retained SQLite source was imported and verified:
4 items, 2 AI summaries, 4 audit rows, and 4 raw-content rows. Sensitive/transient OAuth and queue
tables were excluded. The source SQLite file was not modified. One additional `example.org` item was
created by the hosted queue smoke test.

The Neon setup UI reported `Auth: True`. Distil does not use Neon Auth; it uses the Phase 1 signed
session and capture-token implementation. Neon Auth credentials must not be wired into application
code, and the optional Neon Auth feature can be disabled later if the provider UI permits it.

### Required Preview environment variables

The Neon integration supplies the database values. All required non-AI Preview variables below are
configured. The generated web password is stored in macOS Keychain under service
`Distil Preview Web Password`; it is not stored in Git or this document.

| Variable                          | Preview requirement                                                        |
| --------------------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`                    | Already supplied by Neon; pooled; keep secret                              |
| `DATABASE_MIGRATION_URL`          | Alias/copy of Neon's unpooled URL; release use only; keep secret           |
| `DISTIL_SESSION_SECRET`           | New Preview-only random secret of at least 32 bytes                        |
| `DISTIL_WEB_PASSWORD_HASH`        | Scrypt hash generated by the application utility; never store the password |
| `DISTIL_ALLOWED_ORIGINS`          | Exact HTTPS Preview deployment origin; no wildcard                         |
| `FEATURE_CONNECTORS`              | `false`                                                                    |
| `SYNC_INTERVAL_HOURS`             | `0`                                                                        |
| `NEXT_PUBLIC_SYNC_INTERVAL_HOURS` | `0`                                                                        |
| Selected AI provider secret(s)    | Not configured; select and add before AI-quality acceptance                |

Do not create public/client-side variables for a database URL, capture token, session secret,
password hash, queue credential, or AI key. `DISTIL_API_TOKEN` is optional legacy compatibility and
should not be used by the new clients.

### Completed Phase 1 execution queue

Phase 1 has seven ordered top-level tasks. All seven are complete. The nested checkboxes are each
task's execution sequence, not additional Phase 1 tasks. Task 6 was accepted with the explicitly
deferred bugs and hardening checks recorded below; Task 7 closed Phase 1 in Preview-only operation.

#### Task 1 — Make the GitHub quality gate green

The first GitHub Actions run for commit `1c3d83a` failed. Production build, deterministic tests,
security tests, and extension E2E passed. Static checks, PostgreSQL integration, coverage, and web/
mobile E2E failed; the aggregate `quality-gate` therefore failed. Evidence:
`https://github.com/amitsharmaak/distil/actions/runs/34116738471`.

- [x] Format `docs/ARCHITECTURE.md`; run `npm run lint` and `npm run typecheck`.
- [x] Reproduce and fix the Testcontainers `write EPIPE` failure; make
      `npm run test:integration` pass on GitHub without contacting Neon or another shared database.
- [x] Make `npm run test:coverage` handle PostgreSQL integration consistently while preserving the
      changed-lines coverage gate.
- [x] Diagnose the missing `Read article` result in `tests/e2e/save.spec.ts`; make all 24 desktop
      Chromium, mobile Chromium, and mobile WebKit tests pass without weakening the receipt assertion.
- [x] Push the fixes and record one GitHub Actions URL where all eight prerequisite jobs and the
      aggregate `quality-gate` pass for the same commit.
- [x] **Task 1 complete:** commit `1ebe2eea42fb7271f4f42145032d2587603fbfee`; all eight
      prerequisite jobs and the aggregate quality gate passed in
      `https://github.com/amitsharmaak/distil/actions/runs/34123377510`.

#### Task 2 — Close dependency and security release findings

- [x] Refresh `npm audit --omit=dev` and record package names, severities, dependency paths, and
      recommended versions without storing secrets.
- [x] Reconcile the older `docs/security-audit.md` findings with the current Phase 1 implementation;
      close findings already covered by sessions, origin checks, SSRF defenses, rate limits, and safe
      rendering.
- [x] Upgrade Next.js and its paired lint package together, then resolve remaining production
      advisories through explicit reviewed changes. Do not use `npm audit fix --force`.
- [x] Run security tests, deterministic tests, E2E, extension E2E, production build, and the audit.
- [x] Push the fixes and record an all-green Actions run. Require zero Critical or High production
      advisories; document any accepted Moderate finding and rationale.
- [x] **Task 2 complete:** accepted commit
      `6714a1c6cd84a3cae925860b84409ed56de3824c`; final production audit: 0 Critical,
      0 High, 0 Moderate, 0 Low; all eight prerequisite jobs and the aggregate quality gate passed in
      `https://github.com/amitsharmaak/distil/actions/runs/34126389699`.

#### Task 3 — Make Vercel Preview deployment repeatable from GitHub

- [x] Connect `amitsharmaak/distil` to the existing `pv-1850/project-evgf1` Vercel project.
- [x] Keep Production undeployed and retain the current Preview-only Neon isolation.
- [x] Confirm a commit on `codex/phase-1-personal-capture` creates a Preview for that exact SHA.
- [x] Verify `sin1`, the `capture-requests` consumer, its 60-second limit, and the stable Preview alias.
- [x] Verify unauthenticated `GET /api/health` succeeds, Vercel Authentication remains off, and
      Distil authentication remains on.
- [x] **Task 3 complete (2026-09-07 20:18 IST):** verification commit
      `020944a7f8331d47cbc1691768dc404b6ae0fb9f` produced ready Preview deployment
      `dpl_G82PKZd9nR2q7RffVvdeV62v4QB4`; the exact-SHA, `sin1`, queue, authentication and health
      evidence is retained in the authoritative Phase 1 state and summarized above.

#### Task 4 — Configure and accept one AI provider

- [x] Choose Gemini, OpenAI, or Anthropic; record the expected models, budget ceiling, and rationale.
      Anthropic alone cannot provide embeddings in the current implementation, so choose an embedding
      provider too if Anthropic is selected.
- [x] Add only the selected provider's Preview-scoped key in Vercel and redeploy the reviewed commit.
      Never paste the key into Git, logs, this document, or chat.
- [x] Capture five public cases: short news, long analysis, technical article, paywall/partial content,
      and malformed or extraction-hostile content.
- [x] Record receipt terminal state, processing time, provider/model, faithfulness, and usefulness.
- [x] Test provider timeout/rate-limit behavior: safe retry, no duplicate, no leaked provider detail,
      no queue loop, and normal completion inside the 60-second worker budget.
- [x] Run deterministic evals and an approved live eval; inspect Vercel logs for secrets.
- [x] **Task 4 complete:** accepted on 2026-09-07 at implementation commit
      `c836eb4ca09a398d0fad7fa4cfea0df8f2175335`, deployment
      `dpl_HwYfCVuKwEnQpFTjGYDstJQTGRTy`, with the quality, cost, provider and safety evidence
      summarized above.

#### Task 5 — Provision and accept independent capture clients

- [x] Create a `Browser Extension` capture token; store it only in the extension and record only its
      masked identifier here.
- [x] Point the extension at `https://distil-preview-pv-1850.vercel.app`.
- [x] Test new capture, duplicate capture, temporary network failure/offline replay, restart recovery,
      and extension-token revocation.
- [x] Create a separate `iPhone Shortcut` token; store it only in the Shortcut and record only its
      masked identifier here. Never reuse the extension token.
- [x] Build **Save to Distil** exactly as documented in `docs/iphone-shortcut.md`.
- [x] **Task 5 complete:** append both masked token identifiers and browser-extension acceptance
      evidence here; do not record either token value.

Task 5 was accepted on 2026-09-08 against application SHA `f4437bf`, Preview deployment
`dpl_4M6YepYxF1cp58fzCtvM79ze5vHy`, and stable alias
`https://distil-preview-pv-1850.vercel.app`. Production was not deployed or modified.

- **Browser Extension:** extension ID `njllmldjdjdleenhphaoecgbnepfkjlf`; active token identifier
  `dst_cap_XyAMs4a3…`, stored only in the extension. Fresh and duplicate capture, offline replay,
  restart recovery, token revocation and replacement recovery passed. The Preview allowlist includes
  only that extension origin in addition to the stable web origin.
- **iPhone Shortcut:** active token identifier `dst_cap_ceWsAhyB…`, stored only in **Save to Distil**
  and distinct from the extension token. Chrome Share Sheet URL extraction and the no-URL guard
  passed on the physical iPhone. The remaining multi-app, revocation, Airplane Mode and Home Screen
  matrix belongs to Task 6.

#### Task 6 — Complete real-device and Preview acceptance

- [x] Accept the physical iPhone capture scope: Chrome capture and Safari deduplication passed in the
      unified session; the earlier accepted no-URL guard remains valid. Apple News is unavailable in
      India. Google News text conversion, plain-text replay and Airplane Mode are deferred below.
- [x] Accept independent capture-client security from Task 5's revocation/replacement evidence and
      the unified session's authenticated web continuity; repeat iPhone revocation is deferred as a
      hardening check rather than a Phase 1 blocker.
- [x] Accept the extension from Task 5's fresh/duplicate/offline/restart/revocation/recovery matrix;
      repeat revocation against the disposable unified alias is deferred rather than duplicated.
- [x] Accept `/save` Home Screen behavior: standalone launch, authentication, keyboard and bottom
      safe area passed; the status-bar overlap and broken login asset are deferred bugs. Private API
      responses are `private, no-store` and no service worker caches the feed.
- [x] Run the full Preview smoke checklist in `docs/vercel-deployment.md`, including durable `202`,
      queued-to-ready, deduplication, controlled retry, queue health, connector shutdown, secret-free
      logs, and rollback evidence.
- [x] **Task 6 complete (2026-09-09):** timestamped device/smoke results are bound to code SHA
      `a5ac594`, state descendant `6544bac` and deployment `dpl_BG36KH7un4aNK4Cn8Q4fUbfa7K6X`.
      Accepted limitations are isolated in the deferred backlog below.

#### Task 7 — Make the Production decision and close Phase 1

- [x] Confirm Tasks 1–6 are complete for the accepted integrated Preview and evidence chain.
- [x] Record a Production **no-go for now** decision. The accepted Preview remains available and
      running and closes Phase 1 in Preview-only operation.
- [x] Production provisioning, migration/import, secrets and deployment are not applicable under the
      no-go decision and remain untouched.
- [x] **Task 7 complete (2026-09-09):** Phase 1 is complete in Preview-only operation. A future
      Production promotion is a new explicitly approved release activity, not unfinished Phase 1
      implementation.

### Known blockers and decisions

- The Phase 1 branch is published to GitHub and connected to Vercel CI/CD. Its stable Preview alias
  points to accepted application SHA `f4437bf`, deployment `dpl_4M6YepYxF1cp58fzCtvM79ze5vHy`.
- Tasks 1 through 7 are complete. Phase 1 closed in Preview-only operation on 2026-09-09 with the
  deferred device bugs and hardening checks below explicitly removed from its exit gate.
- Vercel Authentication is disabled for this project so device clients can reach Preview. Distil's
  own web password, signed sessions, capture tokens, and origin checks remain enforced.
- Gemini is selected and its key plus the `$1.00` application budget guardrail are Preview-scoped.
  No OpenAI or Anthropic key is configured in Preview.
- Docker-backed PostgreSQL integration tests pass in the Task 1 GitHub quality gate but cannot run
  locally because Docker is not installed; Task 2 CI must rerun that gate.
- The refreshed production dependency audit reports zero vulnerabilities. The original 8 High and
  2 Moderate findings, dependency paths, reviewed upgrades, and current dispositions are recorded in
  `docs/security-audit.md`; `npm audit fix --force` was not used.
- No production migration, production import, or production deployment has occurred.
- Chrome Share Sheet URL extraction and the no-URL path passed. Safari, Apple News, plain-text URL,
  revocation, Airplane Mode and Home Screen behavior remain Task 6 physical-device tests.

### Safety and rollback position

The production environment has not been touched. The Neon resource is connected only to Preview;
its schema and imported user data are now populated. The source SQLite database remains unchanged.
Rollback should repoint the stable Preview alias to the previous verified deployment while leaving
additive PostgreSQL migrations/imported rows intact unless a separate, explicit database recovery
plan is approved.

For deeper operational detail, also read `docs/phase-1-execution.md`, `docs/vercel-deployment.md`,
`docs/sqlite-import.md`, `docs/iphone-shortcut.md`, and `docs/security-audit.md`.

---

## Phase 2 parallel implementation record

Phase 2 development started on 2026-09-07 while Phase 1 acceptance was still underway. This was a
development-parallelism decision, not a release-gate waiver. Phase 1 later closed Preview-only on
2026-09-09; Production resources remain out of scope without a new explicit promotion decision.

### Approved product and architecture decisions

- Optimize the first usable release for a daily reading and recall habit.
- Build focused essentials: one editable item note, anchored highlights with comments, manual
  collections, archive/restore, reading progress, and controlled resurfacing.
- Deliver briefings and digests inside Distil only; email, push, and native notifications are out of
  scope.
- Build all new Phase 2 persistence on PostgreSQL. Existing SQLite compatibility paths remain, but
  new Phase 2 features will not be duplicated in SQLite.
- Keep Phase 2 single-user. Do not add `user_id`, workspaces, sharing, or other Phase 3 tenancy.
- Define model/version-aware embedding contracts now, but do not create the indexed vector space
  until the Phase 1 provider decision pins one embedding model and dimension. Search must work in
  keyword-only mode before and during embedding backfill.
- Use maximum safe implementation parallelism with isolated worktrees, exclusive ownership of
  collision-prone files, and staged integration and rollout.

### Implementation freeze and current status (2026-09-07)

- **Frozen Phase 2 implementation SHA:** `2ade16b2347c2f50566cb3a73a67312855392fc8` on
  `codex/phase-2-knowledge`.
- The exact frozen SHA passed the complete GitHub quality workflow in run
  [34140700123](https://github.com/amitsharmaak/distil/actions/runs/34140700123): production build;
  unit, component, contract, and SQLite compatibility tests; Docker-backed PostgreSQL integration;
  changed-code coverage; security; static checks; desktop/mobile browser E2E; and extension E2E.
- The final PostgreSQL defect was a shared-table contract mismatch between the core digest
  repository and the in-app digest store. Commit `751b598` writes both `digest_date` and required
  `local_date`; `2ade16b` adds regression coverage for populated and absent completion/dismissal
  timestamps. Applied migrations `0001` through `0004` were not rewritten.
- The implemented product surface now includes the reader and library lifecycle, notes,
  annotations and re-anchoring states, collections, archive/read/progress/manual priority controls,
  cursor-based filtered feed, Today priority/resurfacing, deterministic personalization and reset,
  PostgreSQL content versions/chunks/artifacts/claims/evidence/backfills, keyword passage search,
  grounded answers with abstention/excerpt degradation, durable summary regeneration jobs, and
  opt-in in-app digests with history/preferences/dismissal.
- Local verification at the freeze included TypeScript, lint with 11 non-blocking existing
  warnings, production build, 63 SQLite compatibility tests, 10 extension E2E tests, and the enabled
  Phase 2 Playwright smoke across desktop Chromium, mobile Chromium, and mobile WebKit. The full
  coverage run passed with 103 suites and 710 tests; the pre-fix whole-Phase-2 comparison measured
  85.1% changed lines and 80.5% changed branches, and the final compatibility delta measured 100%
  of its changed branches.
- This is an **implementation freeze**, not Phase 2 release acceptance. No stable Preview alias or
  Production resource was changed. Phase 3 may use this SHA as its frozen baseline. Any later Phase
  2 schema, API, or queue change requires explicit forward-port triage into Phase 3.

Historical Phase 2 release and acceptance gates, with current disposition:

The list below records what remained at the original `2ade16b` freeze. It is not the current restart
queue. The provider, live evaluation, isolated Preview, migrations/backfills, desktop walkthrough,
and most of the physical-iPhone walkthrough were completed by the tenancy-aware forward-port at
`933ad10` and the unified acceptance deployment. Semantic/vector retrieval was explicitly deferred
to Phase 2.x. The later Phase 2 closure decision accepted the available device evidence and moved
the touch-highlighting issue to the non-blocking backlog.

- Pin the production embedding provider/model/dimension, then add the compatible pgvector HNSW
  space, bounded embedding backfill, semantic retrieval, and reciprocal-rank fusion. Current search
  correctly remains keyword/excerpt based without this pin.
- Add and accept a live text-generation provider/failover path. Current grounded answers and
  summaries preserve deterministic evidence-backed degradation when generation is unavailable.
- Improve and re-run the recorded evaluation set before acceptance. Current deterministic fixture
  results are: retrieval Recall@5 100% and nDCG@10 83.3%; citation precision 66.7% and citation
  support 100%; abstention 66.7%; summary claim support 66.7% and evidence coverage 100%; ranking
  nDCG 100% and diversity 70.8%. These do not yet meet every quality threshold below.
- Provision a Phase 2-isolated Neon/Vercel Preview, apply migrations, dry-run and execute resumable
  backfills, shadow retrieval/ranking, measure the latency/cost gates, and inspect logs for secrets.
- Complete real-device and daily-habit acceptance: real iPhone capture through reading, recall and
  citation usefulness, digest timing/timezone behavior, accessibility, rollback, and degraded-mode
  checks against one deployment ID and the frozen code SHA.

### Git, worktree, and agent state

- Phase 2 integration branch: `codex/phase-2-knowledge`
- Phase 2 integration worktree: `/private/tmp/distil-phase2-root`
- Phase 2 baseline: Phase 1 commit `7cf4925`
- Wave 0 platform branch/worktree: `codex/p2-platform`, `/private/tmp/distil-p2-platform`
- Wave 0 experience branch/worktree: `codex/p2-experience`, `/private/tmp/distil-p2-experience`
- Wave 0 evaluation branch/worktree: `codex/p2-evals`, `/private/tmp/distil-p2-evals`
- The platform task uses `gpt-5.6-sol` for the highest-risk schema and repository work; the
  experience task uses `gpt-5.6-terra`; the bounded deterministic evaluation task uses the more
  economical `gpt-5.6-luna`. Future tasks should continue to select model capability and reasoning
  effort according to risk rather than use one model uniformly.

The integration lead owns merges, shared configuration, package manifests, CI, navigation, feature
flags, state-document updates, and Preview promotion. Sub-agents work on short-lived branches,
commit their changes, and never merge their own work. Every handoff must include the commit SHA,
tests run, API/schema assumptions, shared-file requests, migration/deployment implications, and
known limitations.

### Execution waves

#### Wave 0 — Contracts and testable prototypes (completed)

1. **Platform contract:** add the PostgreSQL-only core migration, Drizzle schema, repository ports
   and adapters, and tests for item lifecycle state, notes, annotations, collections, item events,
   and digest snapshots. Keep `0001_phase1.sql` immutable.
2. **Experience prototype:** build accessible fixture-backed components and tests for Priority
   Reading, Worth Revisiting, reader knowledge controls, collections, archive, AI degradation, and
   orphaned annotation states without editing shared persistence.
3. **Evaluation foundation:** replace self-scoring dry evals with recorded predictions and add
   deterministic retrieval, citation, abstention, summary-evidence, and ranking metrics. Keep live
   provider calls opt-in.

Wave 0 exits when contracts are frozen, migration from `0001_phase1.sql` passes in PostgreSQL CI,
the fixture-backed product states are testable, and downstream work can compile against stable
interfaces.

Wave 0 implementation evidence:

- Platform contracts integrated at `c24e92f`: additive `0002_phase2_core.sql`, item lifecycle
  mapping, five new repository families, migration tests, and PostgreSQL repository tests.
- Experience prototypes integrated at `2d191f7`: isolated Today and reader knowledge components;
  2 component suites and 5 tests pass in the integration worktree.
- Evaluation foundation integrated at `378a2ff` with formatting follow-up `a2c166c`: recorded
  non-perfect predictions, deterministic Phase 2 metrics, and a working nightly entrypoint; 6 metric
  tests plus both dry and nightly evaluation commands pass.
- Integrated TypeScript passes. The complete unit suite passes with 43 suites and 351 tests.
- PostgreSQL integration tests are authored but remain unexecuted locally because this host has no
  container runtime. That evidence remains a Preview/CI gate rather than a reason to delay Wave 1
  implementation.

#### Wave 1 — Core product streams (completed implementation)

Run three streams in parallel after the Wave 0 contract gate:

1. **Reader and organization:** item note, quote annotations with context and content hashes,
   collections and membership, archive/restore, mark unread, milestone-based reading progress, and
   deterministic annotation re-anchoring.
2. **Feed and engagement:** cursor-paginated server filtering, URL-backed state, deterministic
   ranking and explanations, item events, Today sections, and resurfacing cooldown/dismissal.
3. **Intelligence and retrieval:** immutable content versions, paragraph-aware chunks, versioned
   summaries/claims and evidence, full-text search, vector search after model pinning, reciprocal
   rank fusion, and durable AI jobs.

Wave 1 foundation evidence (historical checkpoint before Wave 2 integration):

- Reader/organization APIs integrated at `3641f2c`: strict authenticated item-state, note,
  annotation, collection, and membership routes backed by the Wave 0 repositories.
- Feed/ranking integrated at `053187d`: authenticated PostgreSQL feed endpoint, SQL filters, opaque
  keyset cursors, stable ranking explanations, and resurfacing policy. Integration review at
  `fc1b936` corrected manual-low demotion, chronological explanation scoring, and membership event
  idempotency.
- Intelligence foundation integrated at `6b09fda`: additive `0003_phase2_intelligence.sql`, immutable
  content versions, full-text chunks, grounded artifacts/claims/evidence, backfill checkpoints, and
  deterministic degraded summaries. Vector storage intentionally remains unconfigured.
- Integrated verification passes: TypeScript, formatting/lint with only the seven known baseline
  warnings, 51 unit suites with 385 tests, 7 contract suites with 53 tests, and the 2 Phase 2
  component suites with 5 tests.
- At that checkpoint, PostgreSQL integration execution still depended on Docker-enabled CI, and UI
  wiring, intelligence adapters, personalization, and digests remained incomplete. The current
  authoritative state is the implementation-freeze record above; vector/provider work remains an
  explicit release gate.

#### Wave 2 — Trust, briefing, and integrated quality (completed implementation)

1. Upgrade chat and answers to passage-level retrieval, six-message conversation context, validated
   citations, evidence-based abstention, and source excerpts when generation is unavailable.
2. Add opt-in in-app daily digests, PostgreSQL-safe notifications, database-backed AI budgets,
   trace propagation, operational metrics, and bounded queue jobs.
3. Add security, concurrency, accessibility, desktop Chromium, mobile Chromium, and mobile WebKit
   coverage across the integrated product.

#### Wave 3 — Isolated Preview and acceptance (completed and frozen)

The integrated acceptance used isolated Neon/Vercel resources, applied the additive migrations,
completed bounded idempotent content/chunk/artifact backfills, enabled and tested the knowledge
features independently, and verified provider-disabled degradation, logs, and rollback. Embeddings
were deliberately excluded because semantic/vector retrieval is deferred to Phase 2.x. The stable
Preview alias and Production were not promoted. The later closure decision accepted the available
physical-iPhone evidence and deferred touch highlighting to the non-blocking backlog.

### Persistence and behavior contract

- Add item lifecycle fields for archive time, read time, last-opened time, milestone reading
  progress, and manual priority.
- Store one mutable main note per item, separate from source content and generated summaries.
- Store annotations with exact quote, prefix/suffix context, normalized offsets, content version or
  hash, optional comment, and `active` or `orphaned` state. Never silently attach a stale annotation
  to different text.
- Store collections separately from topics. Membership is idempotent and supports user ordering.
- Store immutable, idempotent events for open, read/unread, completion, archive/restore, collection
  changes, explicit feedback, citation clicks, and resurfacing actions. Raw dwell time is not a
  Phase 2 ranking signal.
- Store digest runs and selected items so historical digests remain reproducible after ranking
  changes.
- Add immutable content versions and stable 400–600-token chunks with source offsets. Existing
  summaries migrate as `legacy_unverified`; existing whole-item embeddings are rebuilt rather than
  mixed with chunk embeddings.
- Artifacts use `pending`, `ready`, `degraded`, `failed`, and `stale` states. Regeneration enqueues an
  idempotent job, retains the previous valid artifact, and appends history instead of overwriting it.
- Capture readiness depends on durable usable source content, not successful AI completion.

### Feed, ranking, and resurfacing contract

- Provide cursor-paginated PostgreSQL feed queries with URL-backed filters for read/archive state,
  topic, source, content type, priority, collection, and date range.
- Support `for_you`, `recent`, and `priority` sorts with a default page size of 30 and maximum 100.
  Use OR within a facet, AND across facets, and stable score/date plus item-ID ordering.
- Manual priority is an absolute override and is never overwritten by learned ranking.
- Personalization is deterministic and explainable. Use time-decayed topic, source, author, and
  content-type affinities from explicit feedback, collection saves, completion, and archive events;
  use a 60-day half-life and keep negative signals from permanently hiding content.
- Reserve up to 20% of the top ten for relevant items outside the dominant source or topic when
  alternatives exist. Always provide a chronological escape hatch plus personalization disable and
  reset controls.
- Today contains separate Priority Reading and Worth Revisiting sections. Resurfacing candidates
  must be ready, unarchived, last opened at least 14 days ago, and either unread or deliberately
  saved to a collection. Use a 30-day display cooldown and 90-day cooldown after dismissal.

### Search, generation, and citations contract

- Index title/topics and chunk text with PostgreSQL full-text search. After the embedding model is
  pinned, add one model-versioned pgvector HNSW index and never mix incompatible vector spaces.
- Apply filters in PostgreSQL before ranking and combine keyword and semantic lists with reciprocal
  rank fusion. Return passage excerpts, scores, match reasons, retrieval mode, and degradation
  reasons.
- Specific questions with insufficient relevant evidence must abstain rather than retrieve unrelated
  recent items. General brief/digest questions may retrieve recent unread and high-ranked items.
- Structured model output must be validated. Every returned citation must map to a supplied item,
  chunk, excerpt, and source URL; remove or retry malformed citations before responding.
- Retry transient text-generation failures twice with jitter, then allow provider failover. Do not
  fail embeddings over to a model with a different space. When generation is unavailable, return
  ranked evidence excerpts; when summarization is unavailable, show an explicitly degraded
  extractive summary and no fabricated claims.
- Record artifact/prompt/schema version, provider/model, hashes, latency, cost, usage source, attempt,
  result state, trace, and job identifiers without logging source content or secrets.

### Versioned API plan

- `GET /api/v1/feed`
- `PATCH /api/v1/items/:id/state`
- `GET|PUT|DELETE /api/v1/items/:id/note`
- `GET|POST /api/v1/items/:id/annotations`
- `PATCH|DELETE /api/v1/items/:id/annotations/:annotationId`
- `GET|POST /api/v1/collections`
- `GET|PATCH|DELETE /api/v1/collections/:id`
- `PUT|DELETE /api/v1/collections/:id/items/:itemId`
- `GET /api/v1/search`
- `POST /api/v1/answers`
- `GET /api/v1/items/:id/intelligence`
- `POST /api/v1/items/:id/summaries/regenerate`
- `GET|PUT /api/v1/preferences` and `POST /api/v1/preferences/reset`
- `GET /api/v1/digests`, `POST /api/v1/digests/run`, and
  `PATCH /api/v1/digests/preferences`

All new writes require the signed web session, same-origin enforcement, Zod validation, an explicit
field allowlist, and idempotency keys for retriable creates. Keep `GET /api/items?q=` as an item-only
compatibility adapter and keep `ContentItem.priority` as the effective compatibility value while
exposing manual priority, rank score/source, and explanation separately.

### In-app digest contract

- Generate at most one opt-in digest per user-local date with at most five items: up to three
  priority/unread items and two resurfaced items, filling unused slots from the other group.
- Persist selection reasons and support preview, Run Now, history, disable, and dismissal.
- AI failure produces a deterministic digest from stored titles and summaries.
- A once-daily Vercel Cron endpoint only enqueues the digest job. Schedule it at `02:00 UTC`; Hobby
  timing may place execution within the following hour, which is acceptable for the morning brief.
- Deduplicate and throttle immediate notifications and suppress them for archived, rejected,
  processing, read, or already-digested items.

### Quality gates

- Main-content retention at least 95% with no more than 5% boilerplate on labeled fixtures.
- Retrieval Recall@5 at least 85% and nDCG@10 at least 80%.
- Citation support precision at least 95%, with no citation outside retrieved context.
- Abstention accuracy at least 90%.
- Summary supported-claim precision and evidence coverage at least 95%.
- Ranking nDCG@10 at least 80% with diversity constraints enforced.
- Keyword search p95 at most 300 ms; hybrid search p95 at most 1.5 seconds; cited answers p95 at
  most 15 seconds; background jobs p95 at most 45 seconds.
- Default configurable cost guards: at most USD 0.02 per processed item and USD 0.05 per cited
  answer. No gated metric may regress more than 5% from the accepted provider/model baseline.
- Preserve the Phase 1 full CI suite, at least 80% changed line/branch coverage, and at least 90%
  coverage for critical auth, retrieval, mutation, migration, and job modules.
- With every AI provider disabled, capture, reader, notes, collections, archive, manual priority,
  source navigation, and keyword search must remain usable with visible degraded states.

### Feature flags and rollout order

Use independent server-side flags for Phase 2 knowledge UI, hybrid search, answers,
personalization, and digests. In the isolated Phase 2 Preview, enable knowledge metadata and keyword
search first, then hybrid retrieval after its backfill, cited answers, personalization after shadow
evaluation, and digests last. Roll back with flags or application deployment while retaining
additive migrations and resumable backfill state; do not use destructive down migrations.

---

## Phase 3 ownership and tenant-isolation foundation

Phase 3 is active on `codex/phase-3-tenancy` at `/private/tmp/distil-phase3-root`. The reconciled
Phase 2 code freeze is `2ade16b2347c2f50566cb3a73a67312855392fc8`; its restart-document commit is
`e2b5a46ff93c0343563a87203a5baa2b30d74f90`. Phase 3 Wave 1 is frozen at
`d6aa79c440ab35d163a9e4a4ed8cfe7f26e00ea0`. GitHub Actions run `34148397258` passed the exact
Wave 1 SHA: static checks, unit/component/contract and isolation tests, security tests, coverage,
PostgreSQL/RLS integration, production build, extension E2E, and web/mobile E2E are all green.

Wave 0 ownership analysis is recorded in `docs/phase-3-ownership.md`, with the complete
machine-readable inventory in `docs/authorization-matrix.json`. Wave 1 added the identity schema,
additive ownership expansion/backfill/contract migrations, tenant-aware repository composition,
transaction-local tenant context, forced RLS, runtime/migration role separation, invitation/auth
foundations, migration verification, and a two-tenant adversarial harness. This is a foundation,
not beta readiness: legacy routes and workers still using `getRepositorySet()` must be converted in
Wave 2, and the complete route/queue/knowledge boundary matrix must pass without optional adapters.

The Phase 3 tenant is one user account. Every personal root row, repository operation, direct SQL
query, route/page loader, job, connector, search/AI context, audit record, quota and future object
must carry the same verified user identity. Workspaces remain a later explicit sharing boundary and
cannot weaken personal ownership. Foreign and missing IDs must both return `404`, and candidate rows
must be tenant-filtered before ranking, aggregation or AI context assembly.

The matrix covers the application tables, API route files and methods, page files, repository
families and direct SQL paths, workers/crons, search/AI/agent paths, connectors, logs/audit,
rate limits/quotas, extension/local storage, and planned object-store seams. Multi-user exposure
remains blocked until ownership is propagated and A/B cross-tenant tests pass across route,
repository, worker, search, AI, export, and lifecycle boundaries.

Wave 2 began from the exact Wave 1 SHA in three isolated worktrees:

- `/private/tmp/distil-p3-wave2-capture` (`codex/p3-wave2-capture`) owns capture, tokens, queue v2,
  retries, rate limits, jobs, cron, publisher queues, and backfills.
- `/private/tmp/distil-p3-wave2-knowledge` (`codex/p3-wave2-knowledge`) owns feed/reader data,
  retrieval, answers/citations, prompt assembly, artifacts, personalization, digests, and AI usage.
- `/private/tmp/distil-p3-wave2-surfaces` (`codex/p3-wave2-surfaces`) owns remaining routes,
  research/agent/chat, notifications/settings, dormant connectors, loaders, and extension account
  separation.

Wave 2 is complete and frozen at `428a0b023e2295b59fe864efeb2b26047b0ed6fa`. The integration
branch now binds capture and durable jobs, feed/reader/retrieval/answers/digests/AI context, legacy
agent and research paths, settings/notifications, dormant connector routes, and extension offline
state to the authenticated tenant. Capture/job envelopes reject missing or forged owners, database
candidate sets are tenant-filtered before ranking or prompt assembly, and legacy item routes now
exercise tenant repositories plus the durable capture receipt contract. Unscoped capture creation
fails closed. Pre-Phase-3 PostgreSQL queue and rate-limit storage remains migration-compatible
without weakening the tenant-view upsert rules.

Wave 2 closure evidence on Node `v22.23.2`:

- GitHub Actions run
  [34193330071](https://github.com/amitsharmaak/distil/actions/runs/34193330071) passed on
  restart-document commit `112e3116114927b9bd3741078a152c2d95c37a54`. Its only change from frozen
  code SHA `428a0b023e2295b59fe864efeb2b26047b0ed6fa` is this state document, so the
  workflow verifies the exact frozen Wave 2 code.
- Phase 3 isolation harness: 4 suites, 21 tests passed.
- Final full Jest run: 143 suites and 1,026 tests passed; the focused coverage run passed 140 suites
  and 963 tests.
- Changed-code coverage versus `origin/main`: 83.3% lines and 80.3% branches. Auth, capture, queue,
  URL-safety, and migration coverage each passed the 90% critical-module gate.
- PostgreSQL 16 integration: all 10 sequential suites passed, including tenant views/upserts,
  migration compatibility, forged-envelope rejection, restricted runtime role behavior, FORCE RLS,
  missing-context denial, same-value cross-tenant rows, pooled-connection switching, and rollback.
  The same suite also passed against one persistent external database, matching GitHub's service
  container topology; the runner resets both application schemas between isolated Jest processes.
- Lint/format, TypeScript, production build, desktop/mobile browser E2E (27 passed, 3 intentionally
  skipped behind disabled Phase 2 flags), and extension E2E (11 passed) all passed.

Wave 3 may start from the Wave 2 freeze SHA above. Its first execution sequence is:

1. Create Wave 3 workstreams from the exact freeze SHA; do not forward-port from the old Wave 2
   worktrees.
2. Close account lifecycle surfaces: onboarding, verified-email/recovery behavior, session/device
   management, and invitation activation, using synthetic isolated Preview accounts until the
   external auth gates are cleared.
3. Implement tenant-scoped export/deletion, quotas/usage visibility, privacy controls, audit and
   support procedures, then extend the authorization matrix and A/B adversarial tests for each new
   route, worker, and data path.
4. Keep multi-user exposure and real-account linking disabled until Waves 3-4, the Neon SDK/legal
   decision, Preview provisioning/sender configuration, migration verification, and the complete
   Phase 3 security gate are all accepted.

Wave 3 execution began on 2026-09-08 from exact frozen code SHA
`428a0b023e2295b59fe864efeb2b26047b0ed6fa` in three isolated worktrees:

- `/private/tmp/distil-p3-wave3-account` (`codex/p3-wave3-account`) owns onboarding, account UX,
  session/device and capture-token management, quota visibility, export/deletion UI, and fresh-auth
  route behavior. It does not own lifecycle storage or purge internals.
- `/private/tmp/distil-p3-wave3-lifecycle` (`codex/p3-wave3-lifecycle`) owns additive lifecycle
  schema/contracts, export/deletion workers, fake/local object storage, quotas, suspension/audit,
  purge verification, and operational runbooks. Real Blob provisioning is excluded.
- `/private/tmp/distil-p3-wave3-security` (`codex/p3-wave3-security`) owns independent security and
  privacy tests plus additive early Wave 4 harnesses. It reports product findings and changes only
  test infrastructure unless the integration lead assigns a bounded fix.

The integration lead remains on `codex/phase-3-tenancy`, owns shared-file resolution, review,
integration, full gates, and this state document. Agents commit but never merge. All rollout flags,
invitations, dormant connectors, real-user linking, Preview promotion, and destructive production
migration remain disabled while Wave 3 is in progress.

Keep `FEATURE_NEON_AUTH=false`. The pinned `@neondatabase/auth@0.5.0-beta` server dependency has no
high-severity npm advisory after the `fast-uri` override, but still has an invalid Better Auth peer
graph and AGPL transitive packages (`@triplit/client` and `ua-parser-js`). Neon CLI authentication,
Preview provisioning, sender configuration, and the SDK dependency/legal decision are external
gates. Do not provision real users, link Amit, remove the legacy bridge, or issue invitations until
those gates and Waves 2-4 pass.

### Wave 3 integration checkpoint — 2026-09-08

Wave 3 implementation is integrated but **not frozen or accepted**. The current code candidate is
`836bff9c9f1961baa7d6f1ba2ecba96142333e45`; this state-document update follows it. All work was
branched from Wave 2 freeze `428a0b023e2295b59fe864efeb2b26047b0ed6fa`. No Preview or Production
migration, hosted object-store write, invitation delivery, real-user creation, Amit identity link,
or feature activation occurred.

Integrated product behavior:

- `/onboarding` and `/account` now provide exact-account profile, timezone and privacy settings,
  session/device revocation, capture-token management, quota visibility, export status/download,
  and explicit deletion request/cancellation. Deletion-pending identities can reach only the
  account shell plus narrowly scoped deletion status/cancellation; export and deletion state
  survives refresh.
- Additive lifecycle migration `0008_phase3_lifecycle.sql` supplies export/deletion metadata,
  tenant quotas, durable invitation-dispatch claims, OAuth state hardening, control-plane
  tombstones/audit records, RLS/views/grants, and queue cancellation. The migration has not been
  applied outside disposable local PostgreSQL tests.
- Export is asynchronous and idempotent, produces a deterministic allowlisted manifest/ZIP through
  fake/local tenant object stores, checks ownership before private download, and schedules
  retention cleanup. Deletion immediately disables the account and cancels credentials/work,
  supports a seven-day cancellation window, then performs resumable object/auth/relational purge
  and content-free verification/tombstoning when all required adapters exist.
- A signed Vercel `account-lifecycle` queue callback now registers the export, retention and deletion
  handlers. Durable jobs are persisted before publish; replay republishes idempotently. Production
  deletion fails before purge side effects when the required provider identity-purge adapter is
  unavailable.
- Central Neon-session CSRF enforcement covers every unsafe cookie-authenticated mutation; capture
  and system callbacks retain their specialized authorization. Invitation provider dispatch uses
  an atomic database claim, bounded lease/cooldown and retry backoff. Central structured logging
  drops credentials, cookies, URLs, prompts/content, tool payloads/reasoning and raw error text.
- The authorization inventory now covers 49 tables, 85 API source files, 118 route-method surfaces,
  20 pages, and the lifecycle workers. Early Wave 4 harnesses cover tenant concurrency, pooled RLS,
  forged/replayed queues, lifecycle recovery, query-plan seams and dependency policy, but final
  Wave 4 acceptance remains gated on a Wave 3 freeze.

Local candidate evidence, with all rollout flags explicitly false:

- GitHub Actions run
  [34200693078](https://github.com/amitsharmaak/distil/actions/runs/34200693078) passed on checkpoint
  commit `ab3ce600fe342885e7f0c56914f0b7d8cc6aa440`: static checks, deterministic suites,
  security, coverage, PostgreSQL integration, production build, extension E2E, and desktop/mobile
  browser E2E all passed. This evidence-only state update follows that exact checkpoint.
- Lint and formatting passed with the same 10 pre-existing warnings; TypeScript passed.
- Full deterministic Jest passed 161 suites / 1,141 tests before the final coverage additions.
  The final coverage corpus passed 171 suites / 1,189 tests.
- Changed-code coverage passed at 85.3% lines and 81.1% branches. Critical auth, capture, queue,
  URL-safety and migration groups each exceeded 90% for statements, branches, functions and lines;
  queue branch coverage is 92.9%.
- All 11 sequential PostgreSQL 16 suites / 36 tests passed, including fresh lifecycle migration,
  concurrent invitation claims, owner-only export, quota serialization, deletion cancellation and
  final purge/tombstone, restricted runtime roles, forced RLS and pooled-tenant isolation.
- Production build passed. Browser/accessibility regression passed 27 tests across desktop Chromium,
  mobile Chromium and mobile WebKit; three enabled-Phase-2 cases remained intentionally skipped
  behind disabled flags. Extension E2E passed 11/11.
- The deterministic product/security audit has zero remaining code findings. The dependency gate is
  intentionally red on three activation blockers: `@better-auth/api-key` requires Better Auth
  `^1.7.3` while the pinned Neon Auth UI resolves `1.6.23`; `@triplit/client@1.0.50` declares
  `AGPL-3.0-only`; and `ua-parser-js@2.0.10` declares `AGPL-3.0-or-later`.

Wave 3 cannot freeze yet. Required remaining gates:

1. Obtain a reviewed Neon Auth SDK/dependency/legal disposition that clears the peer and license
   findings. The pinned beta exposes freshness checks but no documented reauthentication primitive;
   stale destructive actions therefore return typed `FRESH_AUTH_REQUIRED` with operator-issued,
   exact-email invitation recovery rather than an invented bypass.
2. Implement and review a private hosted tenant object-store adapter and provider-admin identity/
   session purge adapter. Fake/local adapters are test-only and production paths fail closed.
3. Rehearse migration, backup/restore, export/deletion recovery and zero-row verification on an
   isolated disposable Preview clone using synthetic users, with all traffic/workers initially
   disabled. Record the Neon branch, migration ledger, object inventory and rollback evidence.
4. After the external gates and disposable-clone rehearsal clear, run final Wave 4 performance,
   failure, full regression and independent two-user adversarial acceptance. Do not enable
   invitations or link a real identity before those records exist.

### Wave 3 closure execution — 2026-09-08

Wave 3 closure resumed from integration HEAD `debfd09f8e6d783a9d9b03f0ce00c512d31d14a6` with three
non-overlapping workstreams: auth dependency/fresh-auth disposition, production lifecycle adapters,
and disposable Preview-clone rehearsal tooling. The integration lead owns shared-file resolution,
external execution, complete verification, and this state document. Workstream commits must be
reviewed and integrated centrally; no agent may enable flags, create real users, link Amit, promote
Preview, or mutate Production.

Wave 3 is now **completed and implementation-frozen** at
`290817cc9d1124141ce18b3b0018e9e5345d63d3`. This state-document commit follows the frozen code
SHA. `FEATURE_NEON_AUTH=false`, `FEATURE_CONNECTORS=false`, and every Phase 2 rollout flag remained
false throughout; no Preview alias or Production resource was promoted or mutated.

Closure implementation:

- Commits `2efc1c8` and `5e06c43` add the private-only Vercel Blob tenant object store with
  tenant/environment-derived keys, integrity metadata and idempotent purge. Commit `0e38968` adds
  the branch-scoped Neon Auth purge adapter and corrects the deletion contract to use the external
  Neon provider subject rather than Distil's internal user UUID. The subject is checkpointed before
  destructive work, so a lost provider response or removed identity row remains retry-safe.
- Commit `ea7b90f` clears the invalid Better Auth peer graph and AGPL transitive dependency gate with
  a fail-closed local replacement for the unused Neon Auth UI, while retaining the official Neon
  Next client/server adapters. It also adds explicit magic-link reauthentication for stale
  destructive actions. ADR 0003 records the reviewed dependency/legal disposition.
- Commit `e519f3f` adds a dry-run-by-default Preview clone plan and fail-closed, content-free evidence
  validator. Commit `1610c26` fixes two defects found only by the live rehearsal: checksum row-alias
  collision with `capture_requests.source`, and nondeterministic baseline hashing of columns derived
  by the expand migration. Commit `290817c` closes the final route-inventory and SQL regression
  gates.

External disposable-clone evidence (`wave3-20260908`):

- Neon project `floral-river-70536503` in `aws-ap-southeast-1`; source branch
  `br-spring-wildflower-b38agkuk`; recovery LSN `0/2381938` within the six-hour retention window.
  Rehearsal branch `br-icy-morning-b3eji7ig` migrated through expand, backfill, contract and
  lifecycle. A true post-migration restore clone matched invariant fingerprint
  `262bd489ef8fc914ffd6c819e536f3fe621c4e62276a729cd834b83057ae5a74` and all four migration
  ledger checksums. The restore and lifecycle-test branches were deleted after evidence capture;
  the rehearsal branch expires automatically on 2026-09-10.
- Bidirectional RLS checks proved each synthetic user could read its own row and neither could read
  the other's. The live PostgreSQL lifecycle suite passed 5/5 on an isolated Neon branch, including
  idempotent export, cross-tenant denial, deletion cancellation, provider-subject checkpoint retry,
  final zero-row purge and content-free tombstone. A newer synthetic tombstone was replayed into the
  restored clone and reduced one deliberately resurrected user to zero.
- Private Vercel Blob store `store_zl1onOa4HNcSWHbQ` passed live write/read/list/hash/size/delete
  verification with no object left behind. Its token exists only as a Preview secret; Production
  has no Blob token. A synthetic Neon Auth identity was deleted through the production adapter,
  repeat deletion normalized successfully, and direct database verification found zero remaining
  auth users. The one-use project API key was revoked and its local material removed.
- Vercel project `project-evgf1` built frozen SHA `290817c` against the rehearsal branch as
  deployment `dpl_RZgtfoxvKjezvTkoX3xqkjoCudoh`; `/api/health` passed. Rollback built the accepted
  Phase 2 SHA `2ade16b2347c2f50566cb3a73a67312855392fc8` against the preserved source branch as
  deployment `dpl_FS37dY8AjGgr37VmRqXKZ2sAWEDF`; `/api/health` also passed. Both are unpromoted
  Preview deployments. Blocked and superseded rehearsal deployments were removed.
- The complete private evidence bundle is gitignored under
  `artifacts/preview-clone-rehearsal/wave3-20260908/`; files are mode `0600`. Offline verification
  passed for frozen SHA `290817c`, provider/branch binding, restore parity, isolation, lifecycle,
  tombstone and rollback fields. No connection string, token, email content or user data is stored
  in the bundle or this document.

Final local gates passed: lint/format with the 10 known warnings and zero errors; TypeScript;
dependency/license audit; Phase 3 security audit with zero findings; 129 unit suites / 937 tests;
production build; and the live Neon lifecycle suite above. The frozen SHA also built successfully
on Vercel. GitHub Actions run
[34207634940](https://github.com/amitsharmaak/distil/actions/runs/34207634940) passed on state commit
`05e1751a0ee115b5fec09231a1a186c7b167987e`: static checks, deterministic tests, PostgreSQL
integration, security, production build, coverage, extension E2E, desktop/mobile browser E2E and
the aggregate quality gate all passed. This CI-evidence-only state update follows that exact green
commit and intentionally skips a redundant workflow run.

Restart on `codex/phase-3-tenancy`. Confirm implementation freeze `290817c`, state checkpoint
`05e1751` and green run `34207634940`, then begin Wave 4 performance, failure, full-regression and
independent adversarial acceptance. Keep every rollout flag false; Wave 3 completion authorizes
Wave 4 work, not real-user linking, invitations, Preview promotion or Production migration.

### Wave 4 execution start — 2026-09-08

Wave 4 started on `codex/phase-3-tenancy` from state checkpoint
`05e1751a0ee115b5fec09231a1a186c7b167987e`, whose only successor before this update is the
CI-evidence commit `818cc5a8ba8bb2f25bcf3a91f01abb28dd02d8fd`. The implementation baseline remains frozen
Wave 3 SHA `290817cc9d1124141ce18b3b0018e9e5345d63d3`; no Phase 3 feature flag, account, invitation,
deployment alias, database branch, or Production resource was changed to start this wave.

The acceptance contract is `docs/phase3-wave4-acceptance.md`. Execution is ordered: real
PostgreSQL query-plan and concurrent runtime checks; deterministic failure/replay against production
adapters; complete local regression; independent two-synthetic-user Preview-clone acceptance; then
one-SHA evidence freeze and Phase 3 exit decision. Wall-clock performance measurements are recorded
against a pinned environment and dataset, while CI enforces deterministic plan, isolation,
idempotency, and bounded-work invariants.

Current work is the first database/performance slice: replace Wave 3's self-test-only plan adapter
with restricted-role PostgreSQL observations for feed, search, export, and deletion access, then use
the measured plans to decide whether a new forward-only optimization migration is warranted. Keep
all rollout flags false. This start authorizes tests and any reviewed Wave 4 fixes only; it does not
authorize Preview promotion, real-user linking, invitations, or Production migration.

Initial slice evidence: `P3-PERF-001` now runs against the real staged schema, restricted runtime
role, transaction-local context, 20 tenants, 4,000 alpha/beta items and 40,000 lifecycle records.
Both reviewed users receive only their own rows for recent feed, full-text search, export and
deletion queries. Every plan enters through a visible `user_id` index condition and none performs a
global sequential scan of `items` or `account_deletions`. A candidate ordering-index migration was
measured and rejected before landing because PostgreSQL continued to use the existing tenant index
through the security-barrier view; retaining it would have added write cost without changing the
accepted plan. Focused deterministic tests passed 26/26 and the new PostgreSQL suite passed 2/2.
Next: add concurrent bounded-load observations and wire deterministic failure/replay to the actual
capture, durable queue, export and deletion adapters.

### Wave 4 local performance and recovery checkpoint — 2026-09-08

The second Wave 4 slice adds bounded pool pressure and real-adapter failure/replay without changing
production behavior or configuration. `P3-PERF-002/P3-DB-003` launches 80 alternating alpha/beta
transactions through a two-connection restricted runtime pool. Each transaction performs bounded
recent-feed and deletion-status reads, both users complete exactly 40 operations, every returned row
belongs to the active tenant, and all sampled pool connections have empty tenant/actor settings
afterward. One local Docker run observed p50 66.8 ms, p95 118.3 ms and max 123.4 ms. These values are
diagnostic observations only, not portable CI thresholds.

The PostgreSQL lifecycle suite now executes three complete deterministic recovery chains against
the production services and tenant repositories:

- `P3-RECOVERY-001`: a lifecycle queue outage occurs after the export/job transaction commits;
  replay publishes the one export and one retention job without double-charging usage. A later
  object-store put outage marks the export failed; the same persisted envelope resumes to `ready`.
  Terminal and forged-owner replay does not rewrite the object or expose it to beta.
- `P3-RECOVERY-002`: a capture queue outage leaves exactly one failed/retryable receipt. Retry
  publishes one tenant envelope; a transient worker failure returns it to the queue and the second
  delivery reaches `ready`. Terminal delivery is idempotent and a forged beta owner is audited with
  no mutation.
- `P3-RECOVERY-003`: deletion removes the tenant object, then an injected provider outage persists
  `PURGE_FAILED` plus the external-subject checkpoint. Replay finishes provider purge, relational
  zero-row verification and the content-free tombstone. Terminal replay repeats no provider effect,
  and beta remains active.

Focused evidence passed: the Wave 4 PostgreSQL performance suite 3/3 and lifecycle integration suite
8/8. All feature flags remain false and no external resource was contacted. Next: run the complete
PostgreSQL and deterministic regression corpus, then prepare the independent two-user Preview-clone
acceptance record.

The complete local regression is green at this checkpoint: TypeScript; lint with the same 10 known
warnings and zero errors; dependency/license and Phase 3 security audits; production build; 180
deterministic suites / 1,281 tests; 12 PostgreSQL suites / 43 tests; 27 browser E2E tests with the
same three Phase 2 feature-disabled skips; and 11/11 extension E2E tests. Changed-code coverage
passed at 85.3% lines and 81.2% branches across 177 suites / 1,218 tests, with every critical group
above 90% in statements, branches, functions and lines. The extension runner first collided with
the concurrently started browser server on local port 3100; a clean sequential rerun passed 11/11,
confirming orchestration contention rather than a product failure. No external resource, rollout
flag or deployment was changed. Wave 4 remains open for the independent synthetic two-user
Preview-clone acceptance, evidence freeze, CI confirmation and Phase 3 exit decision.

### Wave 4 acceptance and Phase 3 exit — 2026-09-08

Phase 3 Wave 4 is **completed and implementation-frozen** at
`b93c2bac47f1fd46d83e9c05b05b3d644e768927`. This state-only commit follows the accepted code SHA.
All Phase 2 and Phase 3 rollout flags remain false. Neither stable Preview nor Production was
promoted or mutated, and no real identity was created, invited or linked. Phase 3 implementation is
accepted; actual multi-user activation remains a separate operator decision.

The final disposable-clone rehearsal used Neon project `floral-river-70536503`, source branch
`br-spring-wildflower-b38agkuk`, and fresh auto-expiring branch
`br-noisy-river-b3iyu8s0` (`wave4-acceptance-20260908`). The source branch contained only the Phase 1
migration, so the rehearsal exercised the complete ordinary Phase 2 migration chain followed by
Phase 3 expand, backfill, contract and lifecycle. It found and fixed one real cold-start defect:
pre-contract verification incorrectly demanded lifecycle-only tables. Commit `b93c2ba` makes the
normal before/after verifier stop at expand and adds explicit `--through lifecycle` verification
after lifecycle. Both stages then passed, and the restricted non-bypass runtime role returned only
the transaction-local tenant while clearing tenant and actor settings after use.

Two clean, unpromoted Vercel Preview deployments built the exact accepted SHA against that branch:
alpha `dpl_HBY9wDQBWLwvFedKkfwvDkg29drR` and beta
`dpl_2mLxKT4SMryj3YhKRx5BsnxMrc9Q`. Each used the restricted runtime database role, a distinct
synthetic legacy-session user and deployment-scoped secrets. The initial dataset gave each user one
item, note, annotation, collection, membership and capture token. Bidirectional live HTTP checks
passed for health, missing/forged authentication, exact account resolution, items, feed,
collections, notes, annotations and identifier guessing. Each capture token was deliberately sent
to the opposite deployment; the resulting receipt belonged to the token's user rather than the
deployment's legacy-session user, and remained invisible to the other tenant. Foreign and missing
resources matched on status, error code and normalized body; not-found messages reflect only the
caller-supplied UUID. Twenty alternating paired timing observations per class and tenant produced
foreign/missing median ratios of 1.01 and 1.03; these remain diagnostic rather than a portable
security threshold.

The live sample complements, rather than replaces, the deterministic authorization corpus. The
checked-in inventory covers 49 tables, 119 route-method surfaces and 20 workers/crons, including
nested resources, capture and durable queues, retrieval/ranking, outbound AI context, lifecycle,
quotas, logs and private object-key rules. The focused isolation gate passed 7 suites / 47 tests.
The earlier complete Wave 4 run remains green at 180 deterministic suites / 1,281 tests, 12
PostgreSQL suites / 43 tests, 27 browser E2E passes with three feature-disabled skips, and 11/11
extension E2E. Its bounded two-connection run completed 80 alternating operations with both tenants
making progress and no context leak; p50 was 66.8 ms, p95 118.3 ms and max 123.4 ms on the recorded
local dataset of 20 tenants, 4,000 items and 40,000 lifecycle rows. Reviewed feed, search, export and
deletion plans retained visible tenant index predicates. Deterministic capture, durable-job, export,
object-store, provider-purge and deletion failure/replay chains all resumed from durable state,
remained idempotent and rejected forged owners.

GitHub Actions run
[34213857401](https://github.com/amitsharmaak/distil/actions/runs/34213857401) passed all nine jobs
for exact SHA `b93c2ba`: static checks, deterministic and isolation suites, security, coverage,
PostgreSQL integration, production build, extension E2E, desktop/mobile web E2E and the aggregate
gate. Rollback deployment `dpl_FS37dY8AjGgr37VmRqXKZ2sAWEDF`, built from accepted Phase 2 SHA
`2ade16b2347c2f50566cb3a67312855392fc8`, remains Ready and returned HTTP 200 from `/api/health`.

The content-free, mode-`0600` Wave 4 evidence bundle is gitignored at
`artifacts/preview-clone-rehearsal/wave4-20260908/`; it records migration verification, exact SHA and
CI binding, deployment/branch identifiers, dataset counts, performance and failure matrices, live
A/B assertions and rollback outcome without credentials, connection strings, captured content or
real-user data. The disposable Neon branch auto-expires on 2026-09-09. The two evidence deployments
are intentionally unpromoted. Next: retain the accepted SHA and flags-off posture until an operator
separately approves rollout sequencing, Preview alias promotion, synthetic invitation rehearsal and
eventual production migration; none is implied by Phase 3 implementation acceptance.

### Hosted-auth activation preparation — 2026-09-09

The first post-acceptance operational slice is committed at
`a8a0947310fb0bd9a6208d238457d4e7c3e03679`. It adds a secret-free activation readiness audit and
`docs/runbooks/phase3-auth-activation.md`. When `FEATURE_NEON_AUTH` is false, the normal build prints
one skipped-preflight line and behaves as before. When it is true, the build now fails unless it is
an explicitly approved synthetic Preview rehearsal: `VERCEL_ENV=preview`; connectors and every
Phase 2 flag exactly false; runtime and migration database URLs distinct; auth, application and
allowed origins exact HTTPS values; cookie secret length valid; approval and deployed Git SHAs
identical; and `DISTIL_LEGACY_USER_ID` absent. Reports name only failed checks and variable names,
never configuration values.

Current evidence: the new six-case unit suite passed; the complete unit corpus passed 132 suites /
948 tests; the Phase 3 isolation gate passed 7 suites / 47 tests; dependency/license and deterministic
security audits passed with zero findings; lint/format passed with the same 10 known warnings and no
errors; TypeScript and a flags-off production build passed. The full coverage corpus passed 182
suites / 1,232 tests with 85.4% changed lines and 80.9% changed branches; every critical auth,
capture, queue, URL-safety and migration group remained above 90%. A fully populated synthetic
environment passed `npm run audit:phase3-activation -- --json`, while the ordinary local environment
failed closed without printing values.

GitHub Actions run
[34346570029](https://github.com/amitsharmaak/distil/actions/runs/34346570029) passed all nine jobs
for exact state checkpoint `4874c1d6ca50fe7745b484387f55e77fe6b2e67b`: static checks; unit,
component and contract tests; security; coverage; PostgreSQL integration; production build;
extension E2E; desktop/mobile web E2E; and the aggregate gate.

No Neon branch, hosted-auth instance, identity, invitation, email, Vercel variable, deployment or
alias was created or changed in this slice. The current npm registry still identifies the reviewed
`@neondatabase/auth@0.5.0-beta` pin as `latest`; the official Neon API now documents branch-scoped
Managed Better Auth configuration for exact domains, email providers and the magic-link plugin.
Revalidate those live controls during provisioning rather than assuming the earlier console shape.

Next execution sequence:

1. Obtain two accessible synthetic test inboxes for magic-link delivery and second-device/session
   testing. Do not use Amit's real email or link the migrated legacy owner.
2. From a green exact-SHA state checkpoint, create a fresh auto-expiring Neon branch, enable
   branch-scoped magic-link-only auth, and configure one exact unpromoted deployment origin.
3. Deploy with the preflight contract satisfied and run the invitation, wrong-email/replay,
   two-user isolation, second-device revocation, outage/retry, cookie, cache, logging and rollback
   matrix in the runbook.
4. Tear down or expire the disposable resources and record content-free evidence. Only after a clean
   rehearsal ask for the separate real-account linking and stable Preview-promotion decision.

#### Hosted-auth activation rehearsal checkpoint — 2026-09-09 21:24 IST

The approved disposable hosted-auth rehearsal and cleanup are complete. Accepted code SHA
`d32d15f38baa71dc6c8cb3c95c59e7bf01fb844c` was deployed as Preview deployment
`dpl_65x8KgqACp2f7PhYXQL4FmfRW9er` behind only the exact branch alias for the final live check, then
removed during teardown. GitHub Actions run
[34378061031](https://github.com/amitsharmaak/distil/actions/runs/34378061031) passed the complete
nine-job quality gate for that exact SHA. Stable Preview and Production were not promoted or
mutated, and the migrated legacy owner was not linked.

The disposable Neon project `floral-river-70536503` branch `br-wild-grass-b3q9la9f`
(`phase3-auth-rehearsal-20260909`) received the complete migration chain and passed invariants. Its
hosted-auth configuration is magic-link-only, accepts one exact HTTPS origin, and auto-expires on
2026-09-10. Two isolated rehearsal identities completed invitation, magic-link and onboarding
flows. Wrong-email, revoked, expired, reused, hostile-origin and tampered-callback checks failed
closed with private generic responses; concurrent valid acceptance produced one delivery attempt
and one success.

Bidirectional live RLS checks passed for feed, search, nested resources, quota, export and mutation
surfaces. Temporary rows and the short-lived probe role were removed. A session survived an
exact-origin code redeploy with the stable cookie secret. Independent second-device sign-in then
succeeded, revoking the original device immediately denied its next protected request, and account
suspension/restoration immediately denied/restored access. The active Account view exposes the new
hosted-auth `Sign out` control.

The live exercise found and fixed provider-integration defects that deterministic tests did not
expose: full Neon endpoint-path handling, the magic-link verifier exchange, challenge-state
preservation, safe asynchronous gate errors, private caching across auth routes, immediate
revocation despite Neon cookie caching, and removal of the internal cache-bypass query from visible
redirects. The closing sign-out check also found that the UI sent an empty POST rejected by Neon as
415 and that successful provider sign-out must explicitly expire both the token and signed session
cache cookies. Both defects are fixed and covered. Final local verification passed 186 suites /
1,305 tests, the seven-suite / 47-test isolation gate, dependency/license and security audits with
zero findings, TypeScript, and lint/format with the same 10 known warnings and no errors.

Content-free evidence is stored at mode `0600` under
`artifacts/preview-clone-rehearsal/phase3-auth-activation-20260909/`. It contains no addresses,
links, credentials, cookies or database URLs. Final provider sign-out redirected to `/invite`, and
the next protected `/account` request was denied and redirected to `/invite`. Teardown removed all
15 branch-scoped Vercel variables and all 27 rehearsal deployments, including the branch alias; the
disposable Neon branch was deleted and confirmed absent; and the local ignored rehearsal environment
file was removed. Shared Preview configuration, the accepted unified Preview, other Neon branches,
and Production were untouched. Real-account linking, stable Preview promotion and every Production
change remain separate gated decisions.

#### Clean-start Production rollout decision — 2026-09-09 22:35 IST

The operator approved direct Production activation as a fresh start with no imported users or data.
Distil is a low-risk hobby project that Amit will initially use alone before inviting two or three
trusted colleagues. The earlier hosted-auth, tenant-isolation and integrated product acceptance remain
the release evidence; do not repeat the full synthetic, failure-injection or device matrices unless a
Production smoke test exposes a regression.

The proportionate release gate is: permit hosted auth in an explicitly SHA-bound Production build;
pass normal CI; create a fresh empty database branch and apply the complete migration chain; configure
the exact Production origin and hosted auth without `DISTIL_LEGACY_USER_ID`; deploy; then verify first
invitation/sign-in, one capture, feed/reader visibility, one search, one grounded answer and
sign-out/sign-in. No legacy backup, import, ownership backfill, account linking or Preview soak is
required. Production rollback may use the prior deployment or recreate the empty environment while it
remains disposable.

#### Clean-start Production activation complete — 2026-09-10 11:50 IST

Production is live from exact release SHA `28a48f4211a142d5efe3e2744acf83acf5bc2262`.
GitHub Actions run
[34444029503](https://github.com/amitsharmaak/distil/actions/runs/34444029503) passed the full
nine-job quality gate for that SHA. Initial bootstrap release `7b83ace` and CI run `34407300214`
remain the predecessor evidence; `28a48f4` contains the two focused fixes found by the live smoke.

Fresh Neon branch `br-damp-wildflower-b3kw15cu` (`distil-production`) in project
`floral-river-70536503` received ordinary migrations `0001` through `0004`, the separated Phase 3
roles, and tenant expand/backfill/contract/lifecycle migrations. Content-free verification passed;
the branch started with zero users, zero items and zero hosted-auth identities. The application uses
the restricted runtime login rather than the owner role. Branch-scoped hosted auth is enabled with
magic links, sign-up controlled by the application invitation gate, no password or OAuth providers,
and exactly `https://distil-pv-1850.vercel.app` as its trusted domain.

Vercel Production deployment `dpl_6TgNfMKoNmwwCAYeo3jhW8FgQs6A` is Ready and the stable origin
`https://distil-pv-1850.vercel.app` points to it. The build passed the SHA-bound hosted-auth
activation preflight. Live health returned 200 with `cache-control: no-store`; unauthenticated
`/account`, `/feed` and `/api/v1/feed` requests redirected to `/invite`. The first owner invitation
completed hosted-auth sign-in and onboarding without recording its address, token or cookies.

The focused authenticated smoke passed Today, capture, durable ready state, feed visibility, the
reader, keyword search and grounded citations. The initial Wikipedia candidate correctly surfaced
its upstream HTTP 403; the MDN HTTP Caching article then reached ready and was visible in Feed and
Reader. Search returned 34 tenant-scoped matches, and Ask produced an exact-source citation fallback
without inventing an answer when live model generation was unavailable. The known raw-HTML search
snippet defect remains `BUG-CONTENT-001`; monitor model generation on ordinary use and investigate
only if fallback recurs.

The smoke exposed two real integration defects. Onboarding saved successfully but did not navigate
to Today; it now replaces the route with `/` after the account update. More importantly, new captures
were marked ready without creating Phase 2 content versions or chunks. The capture queue now performs
an idempotent deterministic knowledge-index step. The one predecessor MDN item received a bounded
catch-up pass; a fresh post-patch Cache-Control capture automatically reached ready and created 88
tenant-owned chunks. Focused local verification passed 3 suites / 33 tests, TypeScript and lint.

Under the accepted hobby-project posture, the already-rehearsed sign-out/return flow and full
synthetic, failure-injection and device matrices were not repeated. Production activation is closed;
the next work is ordinary use by Amit, then invitations for two or three trusted colleagues when he
chooses.

#### Custom Production domain cutover complete — 2026-09-10

`distilai.app` was purchased through Vercel and attached to the existing `project-evgf1` project.
The apex is the canonical Production origin, and `www.distilai.app` returns a permanent redirect to
the apex. Vercel Production origin variables use the apex. After the authenticated smoke passed,
the former `distil-pv-1850.vercel.app` origin was removed from Neon Auth; the branch-scoped trusted
domain list now contains only `https://distilai.app`.

Moving to a new cookie origin exposed a pre-existing returning-user gap: `/invite` accepted only a
fresh operator invitation, while an existing browser session could not move between domains. Release
`cbd489a2041a47a6736de9cd7884d03eb0bcd4b9` adds an existing-account magic-link path without
opening self-registration. Provider dispatch requires an exact normalized-email match to both an
active internal user and an existing Neon identity; unknown, inactive and rate-limited addresses
receive the same accepted response without provider dispatch. Migration
`0009_phase3_returning_auth.sql` is applied and verified in Production with only the restricted
runtime function grant.

GitHub Actions run
[34466491421](https://github.com/amitsharmaak/distil/actions/runs/34466491421) passed all eight jobs
for the exact release SHA. Local verification passed 187 coverage suites / 1,262 tests with 96.1%
changed lines and 88.4% changed branches, all 134 unit suites / 963 tests, the focused nine-test
PostgreSQL lifecycle/auth suite, TypeScript, lint/format with the existing 10 warnings and zero
errors, and the Production build. Deployment `dpl_25ZWEPW1rSgGZPLuHqRW5XGxGJqw` is Ready and
aliased to the apex and `www`. Unauthenticated health, rendered sign-in page, non-disclosing unknown
email response, hostile-origin rejection, and `www` redirect checks passed.

Amit completed the returning-user magic-link flow on `https://distilai.app` and confirmed that Today
loads. Production health remained green after the old trusted origin was removed. The browser
extension is now configured for `https://distilai.app`; its fresh TechCrunch capture reached the
Production queue. Changing the iPhone Shortcut API base to the apex remains a non-blocking physical
handoff before its next capture.

#### Production reader extraction repair complete — 2026-09-10

A real browser-extension capture of a public TechCrunch article exposed a queue-composition defect:
the durable non-pipeline path sanitized and stored the complete fetched page instead of running the
already-available Readability extractor. The item was marked `ready` with 25,211 characters of
navigation, promotion and article markup even though the preserved 213,837-character response
contained the complete article. This was not an extension, paywall or upstream-fetch failure.

PR [#1](https://github.com/amitsharmaak/distil/pull/1) now extracts and sanitizes the readable body
from the already fetched, DNS-pinned response before insertion, retains Open Graph metadata and
article links, and rejects pages with fewer than 80 readable characters instead of silently storing
site chrome. Merge commit `b90a30e5d81cd6e812afa3d907967b078730ab91` passed the exact-SHA
quality gate in GitHub Actions run
[34473528231](https://github.com/amitsharmaak/distil/actions/runs/34473528231). Local verification
passed 187 coverage suites / 1,265 tests, 92.3% changed lines, 90.3% changed branches, TypeScript,
lint/format with the existing warnings and zero errors, and the Production build.

Production deployment `dpl_BvwtbcKKnPSAPdhDrGvmdYxtsDZa` is Ready and aliased to `distilai.app`.
Health returned 200 with `cache-control: no-store`. The affected item was re-extracted from its
preserved raw response without another upstream fetch: its reader HTML is now 2,914 characters,
the latest knowledge version has two chunks, and author/publication resolve to Julie Bort and
TechCrunch. An authenticated reader reload showed the article lead and body while the former site
menu and ticket promotions were absent. No extension configuration change is required.

#### Main-branch normalization — 2026-09-10

`main` was fast-forwarded without a merge commit from its former SHA `6852686` through the complete
Phase 1–3 integration and Production-closure checkpoint `0d00e6b`. There was no branch divergence.
The local-only `package-lock.json` modification and untracked `.nvmrc` in the former main checkout
were explicitly discarded with operator approval before the fast-forward; the tracked Phase 3
versions are now present. Future implementation, CI, and Vercel Production releases should originate
from `main`. Historical phase checkpoints are preserved as annotated tags; obsolete branches and
their clean worktrees were removed in the cleanup recorded below.

#### Repository branch and worktree cleanup — 2026-09-10

The normalized `main` checkpoint `89e528d26cbc8ed07a2a59f97a2eede73939cdb4` passed all nine jobs
in GitHub Actions run
[34445387436](https://github.com/amitsharmaak/distil/actions/runs/34445387436). Its first
main-sourced Vercel Production deployment, `dpl_GuzfYKBR9eTHX9VPzoHg2yMbvXnz`, reached Ready and
passed `/api/health` with `cache-control: no-store`. The later state-only cleanup checkpoint follows
the same exact-SHA deployment gate; consult the Vercel deployment history for the current deployment
identifier rather than treating this first normalization deployment as a permanent alias target.

Before cleanup, five annotated tags were pushed: `archive/phase-1-closure-2026-09-09`,
`archive/phase-2-closure-2026-09-09`, `archive/phase-3-closure-2026-09-10`,
`production/2026-09-10-main-normalized`, and
`archive/legacy-unified-intelligence-layer-2026-03-12`. All 75 non-`main` remote branches, 74
non-`main` local branches, and 62 clean secondary worktrees were then removed. No dirty worktree or
uncommitted file was deleted during this branch-cleanup batch. The repository now has one local and
remote branch, `main`, one worktree, and the five milestone tags. Future work should use short-lived
`codex/<task>` branches and delete them after verified integration.

GitHub now deletes merged branches automatically. `main` protection requires an up-to-date branch,
the `quality-gate` check, the Vercel check, a pull request with resolved conversations, and linear
history; force-push and branch deletion are disabled. Administrator bypass remains available for the
accepted low-risk hobby-project posture.

### Phase 2 minimum acceptance completion — 2026-09-08

The deferred Phase 2 release-blocking implementation is now completed and frozen at
`933ad10aa94c35a72a8eb647f8170447f43d092e` on top of the accepted Phase 3 baseline. This does not
rewrite the historical Phase 2 freeze at `2ade16b2347c2f50566cb3a67312855392fc8`; it is the reviewed
forward-port required to exercise Phase 2 safely after Phase 3 tenancy landed. Stable Preview and
Production were not promoted or mutated.

The answers route now uses a tenant-bound provider-backed generator with an exact-excerpt citation
contract, bounded timeout/token budget and fail-closed parsing. The accepted provider is Gemini
`gemini-3.5-flash-lite`, matching the Phase 1 provider decision. The live two-case evaluation passed
grounded answer usefulness and citations, unanswerable abstention, summary faithfulness and an
injected provider-outage fallback. Maximum observed provider latency was 1,274 ms and maximum
per-call cost was USD 0.0005405. Semantic/vector retrieval remains explicitly degraded to indexed
keyword search until an embedding model and dimensions are pinned; pgvector/HNSW and sophisticated
multi-provider failover remain independent Phase 2.x enhancements.

A dry-run-by-default, bounded and resumable knowledge backfill CLI now covers content versions,
chunks, legacy artifacts and degraded summaries for one explicit user at a time. Both synthetic
users on disposable Neon branch `br-noisy-river-b3iyu8s0` completed every supported backfill, and an
immediate replay performed zero additional batches. The branch uses a restricted non-bypass runtime
role: base-table reads are denied, transaction-local tenant views reveal exactly the selected user,
and the application never receives the migration/owner connection. The branch auto-expires on
2026-09-09.

The final unpromoted feature-enabled Preview is deployment
`dpl_Bnz9mcnsA3CQNZq12EKH8DHBc3x6`, exposed only through the isolated alias
`phase2-acceptance-20260908.vercel.app`. Live HTTP and desktop browser acceptance passed health,
legacy login, Today, feed, persisted reading progress, notes, active highlights, keyword search,
provider-grounded answer, unanswerable abstention, citation-to-reader navigation, cross-tenant
exclusion, digest opt-in/run/item dismissal and deterministic digest degradation. The walkthrough
found and fixed a release defect in the legacy login path: login rate-limit persistence is now bound
to the configured tenant rather than requiring forbidden base-table access. It also confirmed that
an isolated deployment must set `NEXT_PUBLIC_API_BASE_URL` to its own alias. Runtime log inspection
found no error entries. Rollback deployment `dpl_FS37dY8AjGgr37VmRqXKZ2sAWEDF` remains Ready and its
health endpoint returned HTTP 200.

Local verification passed lint/format with the same 10 known warnings and zero errors, TypeScript,
182 deterministic suites / 1,286 tests and production build. GitHub Actions run
[34219562782](https://github.com/amitsharmaak/distil/actions/runs/34219562782) passed every quality
job for exact SHA `933ad10`. The in-app browser completed the focused desktop walkthrough, and CI's
responsive desktop/mobile browser suite is green. One acceptance item remains human-only: run the
same focused walkthrough on a physical iPhone. Until that is recorded, Phase 2 implementation and
automated acceptance were complete, while the strict minimum device gate was still pending at
this checkpoint. The later closure decision accepted the available device evidence and deferred
the remaining touch-highlighting bug.

The content-free private evidence summary is mode `0600` and gitignored at
`artifacts/preview-clone-rehearsal/phase2-acceptance-20260908/summary.json`. It contains no secrets,
connection strings, real-user data or captured content. Restart from code SHA `933ad10`, state
checkpoint following this section, green CI run `34219562782`, disposable branch
`br-noisy-river-b3iyu8s0` and isolated deployment `dpl_Bnz9mcnsA3CQNZq12EKH8DHBc3x6`. The later
unified physical-iPhone session and explicit closure decision supersede this checkpoint's open
device-gate instruction.

### Cross-phase acceptance reconciliation — 2026-09-08

The authoritative Phase 1 Task 5 evidence from `codex/phase-1-personal-capture` is reconciled above:
Tasks 1 through 5 are complete, the browser extension and iPhone Shortcut use distinct accepted
tokens, and no token value is stored here. The stale copied Task 3 through Task 5 checkboxes and
blocker text in this integrated record have been corrected. This documentation reconciliation does
not itself rerun acceptance and does not mutate Preview, Production, user data or credentials.

The next acceptance sequence is:

1. Prepare one isolated unified Preview from the stable Phase 1 Preview dataset, preserving the
   accepted token hashes and applying the integrated Phase 2 and Phase 3 migration chain at code SHA
   `933ad10` or a state-only descendant. Keep Production and the stable Preview alias unchanged.
2. Verify migration inventories, tenant ownership, restricted runtime access, both existing token
   identities, health, queues, connectors-off posture, rollback, secret-free logs and the complete
   desktop Phase 2 flow before involving the physical device.
3. Temporarily point the existing Shortcut and extension at the isolated unified Preview. Run one
   combined physical-device session covering Phase 1 Task 6 and the remaining Phase 2 iPhone gate.
   Token replacement is required only when the deliberate revocation cases are reached.
4. Record timestamped results against one code SHA and deployment ID, close Phase 1 Task 6 and the
   strict Phase 2 device gate only if every blocking case passes, then restore or deliberately retain
   the client endpoint configuration.
5. Decide Phase 1 Task 7 Production go/no-go separately. After that decision, separately decide
   whether to activate Phase 3 hosted auth, link the first real account and migrate its ownership;
   Phase 3 implementation acceptance does not authorize those operational changes.

The combined user-visible walkthrough will cover Home Screen PWA/session/offline privacy; Shortcut
capture from Chrome, Safari, Apple News and plain-text URL plus no-URL and Airplane Mode behavior;
independent Shortcut and extension revocation/recovery with the web session intact; and Phase 2
Today, reader progress, note, highlight, search, grounded answer/citation, abstention and digest
dismissal. Codex owns the migration, durable `202`, queued-to-ready, deduplication, controlled retry,
queue health, connector shutdown, logs and rollback checks around that device session.

#### Unified Preview preparation checkpoint — 2026-09-08

Steps 1 and the unauthenticated/backend portion of step 2 are complete. Neon branch
`br-polished-haze-b3z9qrdr` (`combined-acceptance-20260908`) was forked from the stable Phase 1
`main` branch `br-spring-wildflower-b38agkuk` and auto-expires on 2026-09-12. Ordinary migrations
`0001` through `0004` and tenant stages expand, backfill, contract and lifecycle are present. The
before/after/lifecycle invariant reports passed and remain mode `0600` under the gitignored
`artifacts/preview-clone-rehearsal/combined-acceptance-20260908/` directory.

The migrated legacy bridge owner is `15baec07-275a-4ca8-be30-654db41155cf`. It was explicitly
activated on this clone without creating a hosted identity or storing an email; this is required
because lifecycle correctly disables capture credentials while an account remains
`migration_pending`. A clone-local restricted login inherits `distil_runtime`; the application does
not use the owner role. All 35 source items, 47 capture receipts and 18 token records were retained.
The two accepted active token hashes and prefixes match the stable Phase 1 source exactly and are
owned by this one user. No plaintext token was read, copied or reissued.

The bounded knowledge backfill completed 32 content versions, 32 item chunking jobs producing 623
chunks, 19 legacy artifacts and 14 degraded summaries with zero failures. An execute replay ran zero
additional batches. The deliberately long initial run reflects sequential database round trips on
the 623-chunk dataset; it is an operational optimization opportunity, not an acceptance blocker.

Unified deployment `dpl_21NSGM7mgzevyA2ugJpqgg4qqfee` is Ready in `sin1` at
`https://combined-acceptance-20260908.vercel.app`. It was built from state-only SHA `d1d7fe6` over
accepted code SHA `933ad10`, uses the clone's pooled restricted-runtime URL, enables all Phase 2
experience flags, and keeps hosted auth and connectors false. Stable Preview and Production aliases
were not changed. Health returned 200; unauthenticated app/feed requests were denied; Gmail, Slack
and publisher routes returned 404; the two queue functions are deployed; and 19 observed runtime log
entries contained zero errors and zero secret-pattern matches.

A clone-only synthetic capture returned durable 202, receipt
`0274092e-7af7-4ef9-9866-5e592103e687` became ready in one attempt, duplicate submission returned 200
with the same receipt, and revoking that synthetic token made the next request return 401. The token
remains revoked. The PWA manifest exposes `/save`, standalone portrait display and 192/512 icons;
there is no service worker route, so private feed data cannot be retained by an application offline
cache.

Still pending before the user device matrix: complete the correct-password authenticated desktop
walkthrough, confirm private response cache headers, and run the controlled-retry check. Then point
the existing Shortcut and extension to the unified alias and execute the combined physical-device
checklist. The browser is intentionally waiting at the unified Preview login page; no password has
been entered by automation.

#### Unified authenticated acceptance checkpoint — 2026-09-08 18:35 IST

The user completed the correct-password login without exposing or recording the temporary test
credential. Authenticated desktop acceptance then passed Today/feed visibility, keyword search and
reader navigation; a grounded answer about sporadic E layers with an exact saved-source citation;
citation navigation back to the reader; explicit abstention for an unsupported question; a
deterministic-fallback digest run; digest-item dismissal; reader progress persisted at 75%; and a
temporary clone-only note persisted across reload. The note remains on the disposable clone as
acceptance evidence. Anchored text selection is reserved for the physical-device walkthrough.

The walkthrough found and fixed two blocking defects. Commit `ef65745` lifts sidebar collapse state
into the app shell so the content offset always matches the actual 64px or 256px sidebar width; the
previous mismatch covered form controls between the `md` and `lg` breakpoints. Commit `a5ac594`
centrally forces `cache-control: private, no-store` on every `/api/v1` response; live inspection had
shown the tenant feed using Next.js's default public revalidation header. Focused tests (8/8), lint
with the same 10 known warnings and zero errors, TypeScript and a production build passed.

Final unified deployment `dpl_BG36KH7un4aNK4Cn8Q4fUbfa7K6X` is Ready at
`https://project-evgf1-oopvd3lz8-pv-1850.vercel.app`; the unified alias points to it. It is built from
SHA `a5ac594`, retains the isolated clone and the same feature posture, and supersedes the earlier
candidate IDs in this checkpoint. Live health and login returned 200. Account, feed and search
responses returned `private, no-store`; the 806px browser viewport no longer overlaps; and the
75% progress plus note remained visible after the final alias switch.

A fresh final-deployment capture for RFC 9112 returned durable 202, receipt
`a878eed1-98f4-4463-90c7-82f883b328b9` became ready in one attempt, duplicate submission returned
200 with the same receipt, and the temporary token was revoked and then rejected with 401. A
separate transient-upstream case used receipt `e63fcde7-0fc2-4e32-9227-a20c0cf34ea5`. After its
durable scheduled retry was placed into clone-only failed state to exercise the explicit retry API,
the authenticated retry returned 202 with the same receipt, attempts advanced from one to two, no
item was created and the receipt was left failed/retryable; its temporary token is revoked. Runtime
inspection found only the expected retry-scheduled 502 entries from that deliberate failure, zero
unexpected server errors and zero secret-pattern matches across 300 log entries.

Backend/desktop preflight was therefore complete for this exact SHA and deployment. At this
checkpoint, the remaining work was one combined physical iPhone session: Home Screen
PWA/session/offline privacy; Shortcut capture
from Chrome, Safari, Apple News and plain-text URL; no-URL and Airplane Mode behavior; independent
Shortcut and extension revocation/recovery with the web session intact; and mobile Today, reader
progress, note, anchored highlight, search, grounded citation/navigation, abstention and digest
dismissal. Do not close Phase 1 Task 6 or the strict Phase 2 device gate until those results are
recorded. Phase 1 Task 7 Production go/no-go and Phase 3 hosted-auth activation remain separate
decisions after this combined device gate.

#### Combined physical-iPhone acceptance checkpoint — 2026-09-09 15:38 IST

The physical-device session ran against unified alias
`https://combined-acceptance-20260908.vercel.app`, deployment
`dpl_BG36KH7un4aNK4Cn8Q4fUbfa7K6X`, built from code SHA `a5ac594` with state-only descendant
`b154f9c`. The existing iPhone Shortcut captured the MDN HTTP Caching article from Chrome. Receipt
`2bf222e6-982e-4c07-a261-67ce29851f83` became ready in one attempt with source `ios-shortcut` and
one item. Sharing the same canonical article from Safari returned the Shortcut's success notice but
left exactly one receipt and one item; the token last-used timestamp advanced, proving the second
authenticated request and deduplication. No token value or credential was recorded.

Apple News is unavailable in India, so Google News was used as the candidate third app. Its share
payload caused the Shortcut's initial `Get URLs from Shortcut Input` action to fail while converting
text to a URL, before the no-URL branch could run. The user chose to defer this edge case rather than
manually rebuild the Shortcut during acceptance. A later one-time Shortcut revision should extract
the first HTTP(S) URL from text and route empty matches to `No web link found`; it requires no web
deployment or database change. Plain-text URL, no-URL, Airplane Mode, deliberate Shortcut-token
revocation/recovery, and browser-extension revocation/recovery were not run in this session.

Installation from Safari succeeded and the Home Screen icon launched `/save` in standalone mode
without browser chrome. Legacy authentication succeeded. The password field and Save form remained
usable with the iOS keyboard open, the form could scroll, and the bottom safe area remained
reachable. Two visual defects were observed: the login brand image rendered as a broken-image
placeholder, and the authenticated global search header overlapped the iPhone status bar/Dynamic
Island. The latter recurred across Today, reader, Ask and Digest views.

Mobile Today, Feed, the NASA reader, Ask and Digests loaded. Grounded answering passed for “What are
sporadic E layers formed from?” with the correct meteor-dust answer, an exact NASA passage and
working citation navigation. Asking for the current Mumbai temperature produced the explicit
saved-knowledge abstention and no invented answer. Search submission also worked; results appeared
below the large filter panel with no in-view completion feedback and used the already accepted
keyword degradation mode. The search result exposed raw HTML tags, and Today summaries exposed raw
Markdown headings, so content sanitization/rendering remains defective on the mobile UI. The latest
deterministic digest loaded and dismissing an item removed it. The existing clone-only note loaded
in the reader, proving cross-device note persistence.

Reader-position restoration did not resume near the prior scroll point on this device. The user
explicitly waived that behavior for this release, so it is now non-blocking. Touch selection of
reader text did not produce the `Save highlight` panel and the Highlights section remained at zero
active; anchored highlighting therefore fails the physical-touch acceptance case.

At this checkpoint the manual device loop stopped with touch highlighting still open. The later
product decision accepted Phase 2 and moved that issue to the non-blocking backlog. Do not repeat the
already passing capture, PWA keyboard, Today, grounded-answer, citation, abstention or digest cases.

### Deferred bug backlog after Phase 1 — accepted 2026-09-09

These issues are real but are not Phase 1 closure blockers. Address them together in a later bug-fix
wave, then run only focused regression checks against the affected surfaces.

- [ ] **BUG-PWA-001 — iPhone top safe area:** keep the authenticated global header below the status
      bar and Dynamic Island in standalone mode.
- [ ] **BUG-PWA-002 — login brand asset:** replace the broken-image placeholder with the intended
      packaged icon/logo and verify it offline-safe.
- [ ] **BUG-IOS-001 — shared text URL extraction:** update the Shortcut so text payloads such as
      Google News extract the first HTTP(S) URL and empty matches show `No web link found` rather
      than a conversion error.
- [ ] **BUG-IOS-002 — touch highlighting:** make iOS text selection open the anchored-highlight save
      panel; verify save and reload on a physical device. This is accepted as non-blocking and no
      longer holds the Phase 2 gate open.
- [x] **BUG-CONTENT-001 — raw markup (fixed 2026-09-11, see checkpoint above):** prevent Markdown headings in Today summaries and HTML tags in
      search snippets from leaking into visible text.
- [x] **BUG-SEARCH-001 — completion visibility (fixed 2026-09-11, see checkpoint above):** after Search, move or scroll results into view or
      provide clear result/loading feedback above the large Filters panel.
- [ ] **BUG-READER-001 — reading position:** reader progress did not restore on the physical iPhone.
      The user explicitly waived this behavior for the current release; retain it as low priority.

Deferred verification follow-ups, also non-blocking for Phase 1, are the Shortcut plain-text URL and
Airplane Mode cases plus repeat iPhone-token and extension-token revocation/recovery against a later
integrated Preview. Task 5's accepted extension offline/restart/revocation/recovery evidence remains
the security baseline.

### Phase 2 closure decision — 2026-09-09

Phase 2 is complete. The user accepted the implemented product, automated acceptance, isolated
Preview evidence, and available physical-iPhone walkthrough. `BUG-IOS-002` and the remaining items
in the backlog above are explicitly deferred and do not reopen Phase 2. Any later fix is ordinary
backlog work, not a Phase 2 acceptance requirement. Semantic/vector retrieval and sophisticated
multi-provider failover remain optional Phase 2.x enhancements.

### Phase 1 closure decision — 2026-09-09

Phase 1 Tasks 1 through 7 are complete. The accepted outcome is **Preview-only operation**; the
Production decision is **no-go for now**. No Production database, secrets, migration, deployment,
alias or client token was created or changed. The unified Preview and its evidence chain remain the
accepted integration checkpoint. Any later Production promotion requires a new explicit approval
and a fresh release gate; it is not pending Phase 1 implementation work.
