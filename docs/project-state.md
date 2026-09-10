# Distil project roadmap and state

Last updated: 2026-09-10 (Asia/Kolkata)

This is the canonical, durable restart point for the Distil project across development sessions.
Keep the product roadmap stable near the top and continuously update the active-phase status,
decisions, resources, evidence, blockers, and exact next steps below it. Read this file before
resuming work, and update it whenever material progress or a roadmap decision is made. It
intentionally contains no passwords, tokens, database connection strings, session secrets, or AI
provider keys.

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
- [ ] **BUG-CONTENT-001 — raw markup:** prevent Markdown headings in Today summaries and HTML tags in
      search snippets from leaking into visible text.
- [ ] **BUG-SEARCH-001 — completion visibility:** after Search, move or scroll results into view or
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
