# Distil project roadmap and state

Last updated: 2026-09-09 (Asia/Kolkata)

This file preserves the durable historical state of the Phase 1 implementation branch. Current
cross-phase status and restart instructions live in `docs/project-state.md` on
`codex/phase-3-tenancy`. Keep this historical record aligned with later acceptance decisions. It
intentionally contains no passwords, tokens, database connection strings, session secrets, or AI
provider keys.

## State reconciliation — 2026-09-09

Phase 1 is complete. All seven tasks closed in the later integrated acceptance record on
`codex/phase-3-tenancy`; this dedicated branch remains the historical Phase 1 implementation line.
The accepted operating mode is Preview-only with a Production **no-go for now**. Any future
Production promotion is a new release activity, not pending Phase 1 work. The authoritative
cross-phase restart point is `docs/project-state.md` on `codex/phase-3-tenancy`.

## How to use this file

At the start of a new session:

1. Read this file and verify the recorded branch, worktree, commit, and external-resource state.
2. Confirm any time-sensitive external state before acting; do not assume a local server or cloud
   deployment is still running.
3. Consult the authoritative integrated state on `codex/phase-3-tenancy` before resuming work; do
   not treat historical unchecked items here as current tasks.

Record new cross-phase work in the authoritative integrated state. Update this file only when a
later decision changes how the historical Phase 1 record should be interpreted. Keep secrets out of
both files and record only variable names and masked resource metadata.

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
are complete. Task 6 was accepted with an explicit non-blocking backlog, and Task 7 closed Phase 1
in Preview-only mode on 2026-09-09. Production was not promoted.

### Phase 2 — Daily knowledge experience and intelligence quality

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

### Phase 3 — Multi-user web application and tenant isolation

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
- Complete Phase 1 Preview and real-device validation before starting broad Phase 2 feature work.
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

The remainder of this document records the completed Phase 1 implementation and deployment work.

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
- Current stable Preview implementation commit: `020944a7f8331d47cbc1691768dc404b6ae0fb9f`
- Current accepted Task 2 release commit: `6714a1c6cd84a3cae925860b84409ed56de3824c`
- Current accepted Task 3 release commit: `020944a7f8331d47cbc1691768dc404b6ae0fb9f`
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
- Project state: CLI-linked to the Phase 1 worktree and connected to GitHub repository
  `amitsharmaak/distil`. Pushes to `codex/phase-1-personal-capture` create Preview deployments.
  There is no successful Production deployment; the Git connection and Task 3 verification push
  created Preview output only.
- GitHub branch: `https://github.com/amitsharmaak/distil/tree/codex/phase-1-personal-capture`
- Stable Preview URL: `https://distil-preview-pv-1850.vercel.app`
- Current accepted immutable deployment: `dpl_G82PKZd9nR2q7RffVvdeV62v4QB4`
- Deployment inspector: `https://vercel.com/pv-1850/project-evgf1/G82PKZd9nR2q7RffVvdeV62v4QB4`
- Intended application region: Singapore (`sin1`).
- Git repository connection: `amitsharmaak/distil` through Vercel for GitHub.

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
| Selected AI provider secret(s)    | `GEMINI_API_KEY`, Secret, Preview only; value stored only in Vercel        |

Do not create public/client-side variables for a database URL, capture token, session secret,
password hash, queue credential, or AI key. `DISTIL_API_TOKEN` is optional legacy compatibility and
should not be used by the new clients.

### Completed Phase 1 execution queue

All seven tasks are complete. The nested checkboxes are each task's execution sequence, not
additional Phase 1 tasks. Production remains untouched under the recorded Task 7 no-go-for-now
decision.

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
      `dpl_G82PKZd9nR2q7RffVvdeV62v4QB4`; inspector:
      `https://vercel.com/pv-1850/project-evgf1/G82PKZd9nR2q7RffVvdeV62v4QB4`. Vercel tied the
      deployment to branch `codex/phase-1-personal-capture` and the exact commit. Deployment
      resources list `/api/queue/capture-requests`; the reviewed `vercel.json` registers its
      `capture-requests` queue trigger with `maxDuration: 60`; deployment inspection reports
      `sin1`. The stable alias `https://distil-preview-pv-1850.vercel.app` was repointed to this
      deployment. An unauthenticated health request returned HTTP 200, `cache-control: no-store`,
      `x-vercel-id` containing `sin1`, and exactly `{"status":"ok","service":"distil"}`. Vercel
      Authentication is disabled; unauthenticated `/` redirects to `/login`, and `/api/items`
      returns HTTP 401. Every configured project variable remains scoped to Preview. The Git
      connection and verification push created no new Production deployment.

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
- [x] **Task 4 complete:** append accepted quality threshold, results, cost, commit, and deployment ID.

Task 4 acceptance record (accepted 2026-09-07 23:09 IST):

- **Release identity:** implementation commit `c836eb4ca09a398d0fad7fa4cfea0df8f2175335`;
  immutable Preview `https://project-evgf1-okmt9rap6-pv-1850.vercel.app`; deployment ID
  `dpl_HwYfCVuKwEnQpFTjGYDstJQTGRTy`. The stable alias
  `https://distil-preview-pv-1850.vercel.app` was deliberately repointed after all gates passed.
  Task 3 deployment `dpl_G82PKZd9nR2q7RffVvdeV62v4QB4` remains the rollback reference.
- **Provider and implementation:** capture summaries use one native-JSON structured request with
  `gemini-3.5-flash-lite` primary and summary-only quota fallback `gemini-3.1-flash-lite`.
  `gemini-3.5-flash` remains restricted to research/search. Feed and cached brief summaries derive
  from the same validated output; actual successful model and estimated cost are persisted. If both
  candidates fail, a validated extractive feed summary may make the capture ready without creating an
  AI cache row. Unreadable HTML/auth/challenge/paywall shells are rejected.
- **Quality gates:** GitHub run `34147954025` passed static checks, unit/component/contract/security/
  SQLite/PostgreSQL integration tests, 24 web/mobile E2E cases, 10 extension E2E cases, production
  build, and coverage. The final local `test:ci` also passed. Across the complete Task 4 change,
  changed-line coverage was 89.8% and changed-branch coverage was 80.9%. Deterministic evaluation
  remained 50/50. Native structured-JSON live preflight passed for the primary in 1.277s and fallback
  in 1.852s. A repeat of the broader live evaluation was blocked by the separate standard-Flash daily
  quota; it does not exercise or invalidate the accepted summary route.
- **Fresh Preview matrix:** short news receipt/item `89346afc-550a-45f9-aea0-8fe5fd1ed493`
  became ready in 8.324s; long analysis `27e5678f-a369-488f-a3d1-52911911b517` in 7.770s;
  technical article `0ba498b5-75d6-472e-9a12-029eb740d823` in 7.166s; and substantive
  paywall/partial content `c00d5443-9f52-41c9-8cfa-d6373e3ed685` in 6.952s. Each used one worker
  attempt, produced a coherent source-grounded 2-3 sentence plaintext feed summary and a cached brief
  with four key points, initially using `gemini-3.5-flash-lite`. Fresh hostile-login receipt
  `05cf2e82-cd71-4eaa-bf1b-1a9d13c371e6` was rejected in 3.707s as `CONTENT_REJECTED`, with no
  item or cache. No stored result contained HTML or boilerplate.
- **Fallback, regeneration, and deduplication:** forced regeneration of the short-news item received a
  primary quota failure, immediately succeeded once on `gemini-3.1-flash-lite`, and updated the cache
  with that actual model; the following non-force request was a cache hit. Resubmitting its canonical
  URL returned `duplicate=true` with the same receipt/item and no new capture. Deterministic tests
  additionally prove exactly two calls when both candidates return 429, bounded transient retries,
  terminal invalid/auth/budget failures, sanitized typed errors, and extractive degradation.
- **Cost and safety:** the acceptance window logged 19 successful generation calls (27,105 estimated
  input tokens, 4,063 output tokens), 1.075s median and 3.008s maximum successful latency, and an
  **application-estimated logged generation cost** of `$0.01784975`. Model mix was fourteen
  `gemini-3.5-flash-lite` auto-tag calls, four primary summary calls, and one
  `gemini-3.1-flash-lite` fallback summary call. This is below the `$0.25` acceptance threshold; the
  Preview-only `$1.00` application guardrail remains configured. Application/queue/build logs were
  scanned with no token values, connection strings, provider payloads, prompts, article bodies,
  generated responses, or AI-key/session-secret names found.
- **Decision:** accepted. Public capture and summary API shapes are unchanged, Production was not
  deployed or modified, and all acceptance receipts terminated on their first worker attempt within
  the 60-second ceiling.

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
  `dst_cap_XyAMs4a3…`, stored only in the extension. The Preview allowlist includes only that exact
  extension origin in addition to the stable web origin. A fresh NASA article became ready as
  receipt `6597d122-c9ff-4ac8-abd8-a00057b33c14` in one attempt; resubmission returned the same
  capture with no second receipt. A unique capture queued against a deliberately unreachable host
  survived a full Chrome restart and replayed exactly once as ready receipt
  `fe3cceb1-3627-4181-9822-5719ca1d0a5e`. Revoking the then-current extension token produced
  `Capture token needs attention`; installing the replacement token replayed the queued request
  exactly once.
- **iPhone Shortcut:** active token identifier `dst_cap_ceWsAhyB…`, stored only in **Save to Distil**
  and distinct from the extension token. On the physical iPhone, Chrome's Share Sheet payload was
  proven to contain a URL through Apple's Content Graph. The final Shortcut accepts the complete
  shared object, explicitly selects its URL representation, and gates the request on a numeric URL
  count to avoid iOS object-type inference errors. A MacRumors article became ready as receipt
  `42c1e0fb-f61a-4b7b-9029-f124fe1e3c09` in one attempt; a non-URL share correctly reported
  `No Web link found` and sent no request. The full multi-app, revocation, Airplane Mode, and Home
  Screen matrix remains Task 6.

#### Task 6 — Complete real-device and Preview acceptance

- [x] Accept the physical-device scope recorded by the unified iPhone session: Chrome capture,
      Safari deduplication, Home Screen standalone launch, authenticated mobile use, grounded answer,
      citation navigation, abstention, digest dismissal, queue behavior, safe logs, and rollback.
- [x] Retain Google News/shared-text conversion, plain-text replay, Airplane Mode, repeat token
      revocation, touch highlighting, mobile safe-area/asset issues, raw markup, search feedback, and
      waived reading-position restoration in the explicit post-Phase 1 backlog.
- [x] **Task 6 complete (2026-09-09):** accepted against code SHA `a5ac594`, state descendant
      `6544bac`, and deployment `dpl_BG36KH7un4aNK4Cn8Q4fUbfa7K6X`.

#### Task 7 — Make the Production decision and close Phase 1

- [x] Confirm Tasks 1–6 are complete for the accepted evidence chain.
- [x] Record a Production **no-go for now** decision; retain Preview-only operation.
- [x] Leave Production database, migration/import, secrets, deployment, alias, and client tokens
      untouched under the no-go decision.
- [x] **Task 7 complete (2026-09-09):** Phase 1 is closed. A later Production promotion requires new
      explicit approval and a fresh release gate.

### Known blockers and decisions

- The Phase 1 branch is published to GitHub and connected to Vercel CI/CD. The stable Preview alias
  points to accepted application SHA `f4437bf`, deployment
  `dpl_4M6YepYxF1cp58fzCtvM79ze5vHy`; its Preview-only origin allowlist includes the accepted Chrome
  extension ID.
- Tasks 1 through 7 are complete. Phase 1 closed in Preview-only operation on 2026-09-09. Task 2's accepted commit
  `6714a1c6cd84a3cae925860b84409ed56de3824c` passed all eight prerequisite jobs and the aggregate
  quality gate in run `34126389699`. Task 3's accepted commit
  `020944a7f8331d47cbc1691768dc404b6ae0fb9f` is deployed as
  `dpl_G82PKZd9nR2q7RffVvdeV62v4QB4`. The later unified acceptance evidence and deferred backlog
  are authoritative on `codex/phase-3-tenancy`.
- Vercel Authentication is disabled for this project so device clients can reach Preview. Distil's
  own web password, signed sessions, capture tokens, and origin checks remain enforced.
- Gemini is selected and its key plus the `$1.00` application budget guardrail are Preview-scoped.
  No OpenAI or Anthropic key is configured in Preview.
- Docker-backed PostgreSQL integration tests pass in the Task 1 GitHub quality gate but cannot run
  locally because Docker is not installed; Task 2 CI must rerun that gate.
- The Task 2 refreshed production dependency audit reported zero vulnerabilities. The Task 4 server
  parser compatibility pin retains zero High or Critical production findings; four Moderate
  development-only `drizzle-kit`/`esbuild` findings are currently reported by the full audit. The
  original findings and reviewed upgrades are recorded in `docs/security-audit.md`; `npm audit fix
--force` was not used.
- No production migration, production import, or production deployment has occurred.
- The accepted device scope and explicitly deferred follow-ups are recorded on
  `codex/phase-3-tenancy`; none of those follow-ups reopens Phase 1.

### Safety and rollback position

There is no successful Production deployment, and Production has no database or application
secrets. The Neon resource and all configured project variables are connected only to Preview; its
schema and imported user data are populated. The source SQLite database remains unchanged. The
stable Preview alias points to accepted SHA `f4437bf`, deployment
`dpl_4M6YepYxF1cp58fzCtvM79ze5vHy`. Repointing the alias to an earlier accepted deployment does not
require a database rollback. Leave additive PostgreSQL migrations/imported rows intact unless a
separate, explicit database recovery plan is approved.

For deeper operational detail, also read `docs/phase-1-execution.md`, `docs/vercel-deployment.md`,
`docs/sqlite-import.md`, `docs/iphone-shortcut.md`, and `docs/security-audit.md`.
