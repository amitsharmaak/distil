# Distil project roadmap and state

Last updated: 2026-09-07 (Asia/Kolkata)

This is the canonical, durable restart point for the Distil project across development sessions.
Keep the product roadmap stable near the top and continuously update the active-phase status,
decisions, resources, evidence, blockers, and exact next steps below it. Read this file before
resuming work, and update it whenever material progress or a roadmap decision is made. It
intentionally contains no passwords, tokens, database connection strings, session secrets, or AI
provider keys.

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

### Phase 1 — Personal cloud capture and multi-device foundation (active)

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
are complete; real-device testing, the remaining release gates, and the production decision are
still outstanding. Detailed progress begins below.

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

## Phase 1 current execution record

The remainder of this document records the exact state of the active Phase 1 implementation and its
deployment work.

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

### Remaining Phase 1 execution queue

There are seven remaining tasks. Work through them in order and pick up one top-level task at a
time. The nested checkboxes are that task's execution sequence, not additional Phase 1 tasks. Mark
the top-level task complete only when all of its subtasks and completion evidence are present. Do
not start Production work without the explicit decision in Task 7.

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
- [ ] **Task 4 complete:** append accepted quality threshold, results, cost, commit, and deployment ID.

Task 4 progress (2026-09-07, not yet accepted):

- **Provider decision:** Gemini is the only configured Preview AI provider because one Preview-scoped
  key covers both generation and embeddings and matches the existing evaluation harness. Stable
  assignments are `gemini-3.5-flash` for summaries/research/search,
  `gemini-3.5-flash-lite` for classification/tagging/prioritization/preferences, and
  `gemini-embedding-001` for embeddings. The configured in-application ceiling is
  `DISTIL_DAILY_AI_BUDGET=1.00`; this is a per-process guardrail, not a Google billing hard limit.
  Current public list prices recorded during selection were $1.50/$9.00 per million input/output
  tokens for Flash and $0.30/$2.50 for Flash-Lite. Only `GEMINI_API_KEY` and the budget variable were
  added to Preview; no provider secret value was printed or committed.
- **Implementation and tests:** commits `279a31c` and `a042f3b` replace retired/preview model IDs,
  add bounded retry/timeout coverage, and add live-release tests. Deterministic evaluation passed all
  50 cases (100% on every recorded metric). Live evaluation with Flash scored topic precision 98.3%,
  topic recall 98.0%, category accuracy 100%, duplicate precision/recall 100%, priority accuracy 54%,
  and ROUGE-L 25.0%. Priority and ROUGE are Phase 2 calibration baselines, not acceptance evidence for
  the live capture summary path. The ignored live result artifact has SHA-256
  `d189c806e61a2f7ea727ba16070f38db35023bf40eaad688aead07181ba01273`.
- **Production-only defect found and fixed:** the first live matrix exposed a `jsdom` 30 / ESM bundle
  crash on normal HTML. Commit `acf888c` pins the compatible server runtime, refreshes audited
  transitive dependencies, and adds a real-parser regression test. The full local gate then passed:
  500 tests across 65 suites, changed-line coverage 82.3%, changed-branch coverage 85.5%, 24 web/mobile
  E2E cases, 10 extension E2E cases, and a production build. The production audit has no High or
  Critical findings; four Moderate development-only `drizzle-kit`/`esbuild` findings remain. Commit
  `b2736b2` raises the bounded Gemini attempt timeout from five to eight seconds after live summaries
  consistently exceeded the original allowance. Its complete GitHub quality gate passed in
  `https://github.com/amitsharmaak/distil/actions/runs/34142625895`.
- **Final live capture matrix on `b2736b2`, deployment
  `dpl_HCXZDHXip1mcavokbzZZgjVNyDnA`:** short news ready in 12.336s, long analysis ready in 9.078s,
  technical article ready in 9.047s, subscriber/paywall content ready in 10.417s with partial HTML,
  and extraction-hostile content rejected correctly in 1.879s as `UNSUPPORTED_CONTENT`. All five
  reached a terminal state on the first worker attempt inside 60 seconds. A duplicate short-news
  submission returned HTTP 200, `duplicate=true`, and the same receipt. No queue loop or provider
  secret appeared in inspected logs. Logged successful Flash-Lite tagging calls cost approximately
  $0.000249-$0.001965 each; exact matrix total remains to be aggregated before acceptance.
- **Quality result and remaining blocker:** topic generation was useful on all four ready items, and
  the hostile-content rejection was correct. The user-facing summaries did not pass a reasonable
  faithfulness/usefulness threshold: short news fell back to whitespace/date boilerplate, long and
  technical articles fell back to truthful but truncated source openings, and the paywall case stored
  HTML boilerplate. Cached deep summaries were absent. Therefore Task 4 remains incomplete even though
  provider connectivity, durability, deduplication, retry bounds, and terminal timing passed.
- **Only remaining Task 4 bug:** the `gemini-3.5-flash` summary and deep-summary path does not produce
  a usable stored summary. The failure still needs to be isolated between request timeout and invalid
  structured output. All other Task 4 functionality has passed; closing this bug and rerunning the
  acceptance matrix are the only remaining implementation and verification work.
- **Exact restart:** reproduce the Flash summary/deep-summary failure with one captured item;
  distinguish timeout from malformed structured output; fix the summary path without weakening the
  60-second worker bound; rerun the same five cases sequentially; require useful, source-grounded
  summaries for the three public articles, graceful partial/rejection behavior for the paywall and
  hostile cases, zero secret leakage, and all receipts terminal under 60 seconds; aggregate logged
  cost; then record the accepted commit/deployment and mark Task 4 complete.

#### Task 5 — Provision and accept independent capture clients

- [ ] Create a `Browser Extension` capture token; store it only in the extension and record only its
      masked identifier here.
- [ ] Point the extension at `https://distil-preview-pv-1850.vercel.app`.
- [ ] Test new capture, duplicate capture, temporary network failure/offline replay, restart recovery,
      and extension-token revocation.
- [ ] Create a separate `iPhone Shortcut` token; store it only in the Shortcut and record only its
      masked identifier here. Never reuse the extension token.
- [ ] Build **Save to Distil** exactly as documented in `docs/iphone-shortcut.md`.
- [ ] **Task 5 complete:** append both masked token identifiers and browser-extension acceptance
      evidence here; do not record either token value.

#### Task 6 — Complete real-device and Preview acceptance

- [ ] On the iPhone 14 Pro Max, complete Chrome, Safari, Apple News, plain-text URL, no-URL, and
      Airplane Mode cases from `docs/iphone-shortcut.md`.
- [ ] Revoke the iPhone token, verify only the Shortcut fails, replace it, and verify recovery.
- [ ] Revoke the extension token, verify only the extension fails, and confirm the signed web session
      remains usable throughout.
- [ ] Add `/save` to the iPhone Home Screen and verify icon, standalone display, status bar, keyboard,
      safe areas, login persistence, and that private feed responses are not cached offline.
- [ ] Run the full Preview smoke checklist in `docs/vercel-deployment.md`, including durable `202`,
      queued-to-ready, deduplication, controlled retry, queue health, connector shutdown, secret-free
      logs, and rollback evidence.
- [ ] **Task 6 complete:** append timestamped device/smoke results against one Git SHA and deployment
      ID, plus any accepted non-blocking limitation.

#### Task 7 — Make the Production decision and close Phase 1

- [ ] Confirm Tasks 1–6 are complete for the same accepted commit.
- [ ] Record an explicit Production **go** or **no-go** decision. A no-go leaves the accepted Preview
      running and closes Phase 1 in Preview-only operation.
- [ ] If go: provision isolated Production Neon data and independent Production secrets; retain a
      restore point and the source SQLite database. Never reuse Preview secrets or URLs.
- [ ] If go: run the ledger-aware migration, dry-run and review the SQLite import, then execute it and
      retain verification output.
- [ ] If go: deploy only the Task 6 accepted SHA, create Production-specific client tokens, run the
      complete smoke checklist, and verify the rollback procedure.
- [ ] **Task 7 complete:** record the decision, final environment/deployment identifiers, security and
      client evidence, rollback position, and Phase 2 starting point without storing secret values.

### Known blockers and decisions

- The Phase 1 branch is published to GitHub and connected to Vercel CI/CD. The stable Preview alias
  currently points to Task 4 candidate `b2736b2`, deployment
  `dpl_HCXZDHXip1mcavokbzZZgjVNyDnA`; Task 4 is not yet accepted because summary quality failed.
- Tasks 1 through 3 are complete. Task 4 provider/runtime work is implemented but acceptance remains
  blocked on the live summary path. Task 2's accepted commit
  `6714a1c6cd84a3cae925860b84409ed56de3824c` passed all eight prerequisite jobs and the aggregate
  quality gate in run `34126389699`. Task 3's accepted commit
  `020944a7f8331d47cbc1691768dc404b6ae0fb9f` is deployed as
  `dpl_G82PKZd9nR2q7RffVvdeV62v4QB4`. Resume at Task 4's summary-quality blocker described above.
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
- Real iPhone Share Sheet behavior remains a manual device test.

### Safety and rollback position

There is no successful Production deployment, and Production has no database or application
secrets. The Neon resource and all configured project variables are connected only to Preview; its
schema and imported user data are populated. The source SQLite database remains unchanged. The
stable Preview alias points to Task 4 candidate `b2736b2`. The last accepted rollback target is the
Task 3 deployment `dpl_G82PKZd9nR2q7RffVvdeV62v4QB4`; repointing the alias does not require a database
rollback. Leave additive PostgreSQL migrations/imported rows intact unless a separate, explicit
database recovery plan is approved.

For deeper operational detail, also read `docs/phase-1-execution.md`, `docs/vercel-deployment.md`,
`docs/sqlite-import.md`, `docs/iphone-shortcut.md`, and `docs/security-audit.md`.
