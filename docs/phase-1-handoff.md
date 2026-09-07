# Phase 1 progress and deployment handoff

Last updated: 2026-09-07 (Asia/Kolkata)

This document is the durable restart point for Phase 1. It records the product goal, implementation
state, test evidence, local Git layout, Vercel and Neon resources, outstanding decisions, and the
next safe execution steps. It intentionally contains no passwords, tokens, database connection
strings, session secrets, or AI provider keys.

## Product goal and scope

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

## Git and workspace state

- Integration branch: `codex/phase-1-personal-capture`
- Integration worktree: `/private/tmp/distil-phase1-root`
- Current implementation commit before this handoff: `c0807b1`
- Git remote: `git@github.com:amitsharmaak/distil.git`
- The Phase 1 branch is local and has not yet been pushed to GitHub.
- The original checkout at `/Users/amitsharma/Projects/distil` remains on `main` and has user-owned
  changes: a modified `package-lock.json` and an untracked `.nvmrc`. Do not stash, discard, overwrite,
  or include those changes in Phase 1 work.

All further Phase 1 implementation, tests, commits, migration commands, and deployments should run
from `/private/tmp/distil-phase1-root` unless the worktree layout is deliberately changed.

## Implementation completed

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

## Test and review status

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

## Local application status

The Phase 1 application was successfully built and exercised locally. It was most recently served at
`http://127.0.0.1:3100`. A local process may still exist, but process state is not durable; verify the
port before relying on it. Start it again from the integration worktree when needed:

```bash
cd /private/tmp/distil-phase1-root
npm run dev -- --hostname 127.0.0.1 --port 3100
```

## Vercel account and project

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

## Neon database

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

## Required Preview environment variables

The Neon integration supplies the database values. The remaining application values must be added
to the Vercel Preview environment before deploying:

| Variable | Preview requirement |
| --- | --- |
| `DATABASE_URL` | Already supplied by Neon; pooled; keep secret |
| `DATABASE_MIGRATION_URL` | Alias/copy of Neon's unpooled URL; release use only; keep secret |
| `DISTIL_SESSION_SECRET` | New Preview-only random secret of at least 32 bytes |
| `DISTIL_WEB_PASSWORD_HASH` | Scrypt hash generated by the application utility; never store the password |
| `DISTIL_ALLOWED_ORIGINS` | Exact HTTPS Preview deployment origin; no wildcard |
| `FEATURE_CONNECTORS` | `false` |
| `SYNC_INTERVAL_HOURS` | `0` |
| `NEXT_PUBLIC_SYNC_INTERVAL_HOURS` | `0` |
| Selected AI provider secret(s) | Preview-scoped; configure only the selected provider |

Do not create public/client-side variables for a database URL, capture token, session secret,
password hash, queue credential, or AI key. `DISTIL_API_TOKEN` is optional legacy compatibility and
should not be used by the new clients.

## Exact next execution sequence

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

## Known blockers and decisions

- The Phase 1 branch must be pushed or deployed through the Vercel CLI; Vercel currently has no code.
- The Preview database is empty until migrations and the optional SQLite import are run.
- `DATABASE_MIGRATION_URL` still needs a secure mapping from `DATABASE_URL_UNPOOLED`.
- Preview application secrets, password hash, allowed origin, and AI provider selection are not set.
- The 300-second committed queue worker duration is incompatible with Hobby's 60-second maximum.
- Docker-backed PostgreSQL integration tests still need a clean run.
- No Vercel Preview deployment, production migration, production import, or production deployment has
  occurred.
- Real iPhone Share Sheet behavior remains a manual device test.

## Safety and rollback position

The production environment has not been touched. The Neon resource is connected only to Preview,
and no application schema or user data has been written yet. The source SQLite database must remain
unchanged. Rollback after a future deployment should promote the previous Vercel deployment while
leaving additive PostgreSQL migrations/imported rows intact unless a separate, explicit database
recovery plan is approved.

For deeper operational detail, also read `docs/phase-1-execution.md`, `docs/vercel-deployment.md`,
`docs/sqlite-import.md`, `docs/iphone-shortcut.md`, and `docs/security-audit.md`.
