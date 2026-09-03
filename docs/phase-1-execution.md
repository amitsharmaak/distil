# Phase 1 execution ledger

Phase 1 turns Distil into a secure, single-user, multi-client application. The
browser application, an iPhone Shortcut, and the browser extension all capture
URLs through one durable API backed by PostgreSQL. Gmail, Slack, RSS, native
mobile applications, and multi-user workspaces remain outside this phase.

## Gated delivery

1. Establish deterministic unit, component, contract, integration, security,
   browser, mobile, and extension test harnesses.
2. Freeze asynchronous repository and capture contracts.
3. Move persistence from SQLite to PostgreSQL and provide a verified importer.
4. Add sessions, independently revocable capture tokens, durable capture
   receipts, URL safety, and queue-backed processing.
5. Add the mobile save page, PWA metadata, iPhone Shortcut runbook, and reliable
   offline extension capture.
6. Run independent security, reliability, and product reviews before rollout.

Product implementation cannot cross a gate until the preceding deterministic
test suite is green. Hosted databases, AI providers, connectors, Vercel, and
arbitrary websites are never contacted by automated tests.

## Shared-file ownership

The integration lead exclusively owns package manifests, Jest and Playwright
configuration, CI, public contracts, the central database facade, application
configuration, middleware, instrumentation, the intelligence pipeline, the
legacy `POST /api/items` route, `next.config.ts`, and `vercel.json`. Parallel
agents work in temporary branches and worktrees, commit only their assigned
paths, and request changes to these shared files in their handoff.

Every handoff records the commit, changed files, tests and exact commands,
contract assumptions, shared-file requests, known limitations, and deployment
or migration implications. A different agent reviews each feature before the
integration lead closes its gate.

## Suite names

- `*.unit.test.ts(x)` contains pure logic.
- `*.component.test.tsx` contains React/jsdom behavior.
- `*.contract.test.ts` verifies route and schema contracts.
- `*.integration.test.ts` uses the isolated Testcontainers PostgreSQL instance.
- `*.sqlite-integration.test.ts` temporarily characterizes the legacy store.
- `*.security.unit.test.ts` verifies authentication and trust boundaries.
- `tests/e2e/*.spec.ts` exercises the real Next.js application.
- `tests/extension/*.spec.ts` launches the unpacked extension.
- `*.live.test.ts` is opt-in and excluded from deterministic CI.

## Release invariant

A successful capture response means the receipt is persisted and its queue
message was accepted. Queue messages contain only their schema version and
capture ID. Migrations are an explicit release step; they never run during
module import or request startup. The source SQLite database and the previous
Vercel deployment remain available for rollback.
