# Distil project roadmap and state

Last updated: 2026-09-08 (Asia/Kolkata)

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
- Phase 2 implementation may proceed in isolated branches, worktrees, databases, and Preview
  deployments while Phase 1 acceptance continues. Do not promote Phase 2 to the stable Preview or
  Production until Phase 1 Preview and real-device validation are complete.
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

- [ ] Connect `amitsharmaak/distil` to the existing `pv-1850/project-evgf1` Vercel project.
- [ ] Keep Production undeployed and retain the current Preview-only Neon isolation.
- [ ] Confirm a commit on `codex/phase-1-personal-capture` creates a Preview for that exact SHA.
- [ ] Verify `sin1`, the `capture-requests` consumer, its 60-second limit, and the stable Preview alias.
- [ ] Verify unauthenticated `GET /api/health` succeeds, Vercel Authentication remains off, and
      Distil authentication remains on.
- [ ] **Task 3 complete:** append the Git SHA, deployment ID, inspector URL, and health evidence here.

#### Task 4 — Configure and accept one AI provider

- [ ] Choose Gemini, OpenAI, or Anthropic; record the expected models, budget ceiling, and rationale.
      Anthropic alone cannot provide embeddings in the current implementation, so choose an embedding
      provider too if Anthropic is selected.
- [ ] Add only the selected provider's Preview-scoped key in Vercel and redeploy the reviewed commit.
      Never paste the key into Git, logs, this document, or chat.
- [ ] Capture five public cases: short news, long analysis, technical article, paywall/partial content,
      and malformed or extraction-hostile content.
- [ ] Record receipt terminal state, processing time, provider/model, faithfulness, and usefulness.
- [ ] Test provider timeout/rate-limit behavior: safe retry, no duplicate, no leaked provider detail,
      no queue loop, and normal completion inside the 60-second worker budget.
- [ ] Run deterministic evals and any approved live eval; inspect Vercel logs for secrets.
- [ ] **Task 4 complete:** append accepted quality threshold, results, cost, commit, and deployment ID.

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

- The Phase 1 branch is published to GitHub and deployed through the CLI, but it is not yet connected
  to Vercel CI/CD.
- Tasks 1 and 2 are complete. Task 2's accepted commit `6714a1c6cd84a3cae925860b84409ed56de3824c`
  passed all eight prerequisite jobs and the aggregate quality gate in run `34126389699`. Resume at
  Task 3: connect the existing Vercel project to GitHub without deploying Production.
- Vercel Authentication is disabled for this project so device clients can reach Preview. Distil's
  own web password, signed sessions, capture tokens, and origin checks remain enforced.
- The AI provider selection and Preview AI secret are not set.
- Docker-backed PostgreSQL integration tests pass in the Task 1 GitHub quality gate but cannot run
  locally because Docker is not installed; Task 2 CI must rerun that gate.
- The refreshed production dependency audit reports zero vulnerabilities. The original 8 High and
  2 Moderate findings, dependency paths, reviewed upgrades, and current dispositions are recorded in
  `docs/security-audit.md`; `npm audit fix --force` was not used.
- No production migration, production import, or production deployment has occurred.
- Real iPhone Share Sheet behavior remains a manual device test.

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

Phase 2 development started on 2026-09-07 while Phase 1 acceptance continues. This is a development
parallelism decision, not a release-gate waiver: the stable Phase 1 Preview database and alias and
all Production resources remain out of scope until Phase 1 closes.

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

Remaining Phase 2 release and acceptance gates:

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

#### Wave 3 — Isolated Preview and acceptance (pending)

Use a Phase 2-specific Neon branch/database and Vercel Preview. Apply additive migrations, verify
dry-run backfill counts, enable knowledge features first, backfill chunks and embeddings in bounded
idempotent batches, shadow retrieval and ranking, and then enable answers, personalization, and
digests independently. Do not point the stable Preview alias at Phase 2 during this wave.

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

Wave 2 is complete and frozen at `b14529b984a0fb38fb7085edb719560f9a07a5e1`. The integration
branch now binds capture and durable jobs, feed/reader/retrieval/answers/digests/AI context, legacy
agent and research paths, settings/notifications, dormant connector routes, and extension offline
state to the authenticated tenant. Capture/job envelopes reject missing or forged owners, database
candidate sets are tenant-filtered before ranking or prompt assembly, and legacy item routes now
exercise tenant repositories plus the durable capture receipt contract. Unscoped capture creation
fails closed. Pre-Phase-3 PostgreSQL queue and rate-limit storage remains migration-compatible
without weakening the tenant-view upsert rules.

Wave 2 closure evidence on Node `v22.23.2`:

- Phase 3 isolation harness: 4 suites, 21 tests passed.
- Final full Jest run: 143 suites and 1,026 tests passed; the focused coverage run passed 140 suites
  and 963 tests.
- Changed-code coverage versus `origin/main`: 83.3% lines and 80.3% branches. Auth, capture, queue,
  URL-safety, and migration coverage each passed the 90% critical-module gate.
- PostgreSQL 16 integration: all 10 sequential suites passed, including tenant views/upserts,
  migration compatibility, forged-envelope rejection, restricted runtime role behavior, FORCE RLS,
  missing-context denial, same-value cross-tenant rows, pooled-connection switching, and rollback.
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

Keep `FEATURE_NEON_AUTH=false`. The pinned `@neondatabase/auth@0.5.0-beta` server dependency has no
high-severity npm advisory after the `fast-uri` override, but still has an invalid Better Auth peer
graph and AGPL transitive packages (`@triplit/client` and `ua-parser-js`). Neon CLI authentication,
Preview provisioning, sender configuration, and the SDK dependency/legal decision are external
gates. Do not provision real users, link Amit, remove the legacy bridge, or issue invitations until
those gates and Waves 2-4 pass.
