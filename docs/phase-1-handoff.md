# Distil master plan and Phase 1 progress handoff

Last updated: 2026-09-07 (Asia/Kolkata)

This is the durable restart point for the overall Distil product plan and the active Phase 1
execution. Read the master plan first to understand why Phase 1 exists, then use the Phase 1 record
to resume implementation and deployment. This file intentionally contains no passwords, tokens,
database connection strings, session secrets, or AI provider keys.

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
failures without duplicates or lost work. The Preview deployment, real-device test, and production
decision are still outstanding; detailed progress begins below.

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
- Git remote: `git@github.com:amitsharmaak/distil.git`
- The Phase 1 branch is local and has not yet been pushed to GitHub.
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

The latest corrective commit makes capture clients handle non-JSON server failures safely.

### Test and review status

The most recently completed local verification reported:

- Deterministic Jest suite: 542 passing tests.
- Security suite: 108 passing tests.
- Browser/mobile E2E: 24 passing tests.
- Browser extension E2E: 10 passing tests.
- Changed executable code coverage: 82.9% lines and 85.4% branches relative to `main`.
- Critical auth, capture, queue, URL-safety, and migration modules: above the 90% coverage gate.
- Lint, formatting, TypeScript, changed-line coverage, and production build: passing.

PostgreSQL Testcontainers could not be executed in the local environment because a Docker runtime
was unavailable. The harness and tests exist, but that Docker-backed gate still needs one clean run
on a host or CI runner with Docker. Hosted services are excluded from deterministic tests.

Before promotion, rerun `npm run test:ci` and the PostgreSQL integration suite in a Docker-capable
environment. Do not reinterpret the stored counts as a substitute for a fresh release run.

### Local application status

The Phase 1 application was successfully built and exercised locally. It was most recently served at
`http://127.0.0.1:3100`. A local process may still exist, but process state is not durable; verify the
port before relying on it. Start it again from the integration worktree when needed:

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
- Project state: empty project connected to Neon; no Preview or Production deployment has been made.
- Intended application region: Singapore (`sin1`).
- Git repository has not yet been connected to the Vercel project.

Vercel Queues is currently available on Hobby, but Hobby functions can be configured for at most 60
seconds. The committed `vercel.json` still requests 300 seconds for the capture consumer, which is a
Pro-plan limit. Before the first Hobby preview deployment, change the preview-compatible value to 60
seconds or adopt an environment/configuration strategy that keeps the reviewed 300-second production
target without making the Hobby build invalid. Real captures must be tested to determine whether the
60-second worker budget is adequate.

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

The application expects the unpooled release URL under `DATABASE_MIGRATION_URL`, so the next setup
must securely map/copy `DATABASE_URL_UNPOOLED` to `DATABASE_MIGRATION_URL` for Preview. Never commit
either value. Keep runtime requests on pooled `DATABASE_URL` and migrations/imports on the unpooled
URL.

The Neon setup UI reported `Auth: True`. Distil does not use Neon Auth; it uses the Phase 1 signed
session and capture-token implementation. Neon Auth credentials must not be wired into application
code, and the optional Neon Auth feature can be disabled later if the provider UI permits it.

### Required Preview environment variables

The Neon integration supplies the database values. The remaining application values must be added
to the Vercel Preview environment before deploying:

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
| Selected AI provider secret(s)    | Preview-scoped; configure only the selected provider                       |

Do not create public/client-side variables for a database URL, capture token, session secret,
password hash, queue credential, or AI key. `DISTIL_API_TOKEN` is optional legacy compatibility and
should not be used by the new clients.

### Exact next execution sequence

1. Resolve the Hobby duration mismatch in `vercel.json` and run the affected contract/build tests.
2. Commit this handoff and any duration adjustment on `codex/phase-1-personal-capture`.
3. Decide how to deploy the local-only branch:
   - Preferred for ongoing CI/CD: push the Phase 1 branch and connect the GitHub repository to the
     existing Vercel project without deploying `main`.
   - Alternative for the first isolated test: link the existing Vercel project with the Vercel CLI
     from the integration worktree and create a Preview deployment directly.
4. Add the Preview-only environment variables. Generate secrets locally and transmit them only to
   Vercel; do not place them in this file, Git, screenshots, chat, test artifacts, or shell history.
5. Pull/use the Preview environment securely and set `DATABASE_MIGRATION_URL` from the unpooled Neon
   value for the release process.
6. Apply migrations explicitly with `npm run db:migrate`. Migrations must never run during build,
   module import, application startup, or request handling.
7. Run the SQLite importer in dry-run mode and inspect counts/exclusions:

   ```bash
   npm run db:import:sqlite -- data/distil.db
   ```

8. Only after the dry run is correct, import with `--execute` and retain the verification output.
9. Deploy the exact reviewed commit to Vercel Preview; do not promote it to Production.
10. Set `DISTIL_ALLOWED_ORIGINS` to the exact assigned Preview URL and redeploy if necessary.
11. Verify `/api/health`, authentication, capture creation, queue processing, duplicate capture,
    retry behavior, token revocation, secret-free logs, and disabled connectors.
12. Test several real articles within the Hobby 60-second worker limit.
13. Configure separate tokens for the iPhone Shortcut and browser extension only after the Preview
    backend is verified.
14. Run the real-device checklist on the iPhone 14 Pro Max using Chrome and at least two other apps.
15. Keep Production disconnected until Preview acceptance and an explicit promotion decision.

### Known blockers and decisions

- The Phase 1 branch must be pushed or deployed through the Vercel CLI; Vercel currently has no code.
- The Preview database is empty until migrations and the optional SQLite import are run.
- `DATABASE_MIGRATION_URL` still needs a secure mapping from `DATABASE_URL_UNPOOLED`.
- Preview application secrets, password hash, allowed origin, and AI provider selection are not set.
- The 300-second committed queue worker duration is incompatible with Hobby's 60-second maximum.
- Docker-backed PostgreSQL integration tests still need a clean run.
- No Vercel Preview deployment, production migration, production import, or production deployment has
  occurred.
- Real iPhone Share Sheet behavior remains a manual device test.

### Safety and rollback position

The production environment has not been touched. The Neon resource is connected only to Preview,
and no application schema or user data has been written yet. The source SQLite database must remain
unchanged. Rollback after a future deployment should promote the previous Vercel deployment while
leaving additive PostgreSQL migrations/imported rows intact unless a separate, explicit database
recovery plan is approved.

For deeper operational detail, also read `docs/phase-1-execution.md`, `docs/vercel-deployment.md`,
`docs/sqlite-import.md`, `docs/iphone-shortcut.md`, and `docs/security-audit.md`.
