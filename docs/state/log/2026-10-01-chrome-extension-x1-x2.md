---
topic: chrome-extension-web-store
title: Chrome extension X1 (browser connections) and X2 (extension 2.0) implemented locally
date: 2026-10-01
time: 08:00
status: in-progress
branch: claude/chrome-extension-x1-x2
---

## What changed

Amit answered the X1–X3 decisions in chat on 2026-09-30, all option A: per-browser connection
tokens with the manual token kept for the iPhone Shortcut; handoff through
`externally_connectable` with a state nonce and a pinned extension id; connections never expire
and are revocable in Settings; Web Store listing unlisted first (X3); the Options page keeps an
Advanced origin field. He chose to build X1 and X2 on one branch. Spec: checkpoint "Chrome
extension: token-free sign-in and Web Store listing — plan X1–X3 — 2026-09-30" in
`docs/project-state.md`.

**X1, server.** Tenant stage `browser-connections`
(`src/lib/postgres/tenant-migrations/0014_browser_connections.sql`) adds `capture_tokens.kind`
(`manual` default, or `browser`) and `label`, and rebuilds `tenant_api.capture_tokens`.
`GET`/`POST /api/v1/extension/connections` and `DELETE …/:id` list, mint and revoke per-browser
tokens (kind-scoped; regenerating the manual token leaves browser rows alone). Public
`/extension/connect` page hands the token to the pinned extension id with the state nonce;
returning users come back to it after sign-in through a sealed `next` (`src/lib/auth/sign-in-next.ts`).
Settings → Capture gains "Connected browsers" with Disconnect. Authorization matrix, route
fixtures and `AGENTS.md` updated.

**X2, extension 2.0.** `browser-extension/manifest.json` 2.0.0 with the public `key` pinned,
host permission for `https://distilai.app/*`, `externally_connectable` for Production and
`http://localhost:3000`. Options page: Sign in / Signed in as / Disconnect plus an Advanced
origin field; no token input. The background worker keeps a pending-connect state (ten-minute,
single-use nonce), accepts the token only from the matching origin and state, clears the token on
401 while keeping the queue, and namespaces queues per account. Popup shows "Sign in again".
`src/lib/extension/constants.ts` lists accepted extension ids; X3 appends the Web Store id if it
differs from the pinned development id.

The extension private key was generated outside the repo and is not committed.

Agents' runs stalled several times; the branch was finished by the main session. Fixes made then:
the extension harness now records the URL the worker opens and loads it in a test-controlled page
(extension-opened tabs could load before Playwright routes attached); the signed-out check asserts
the worker's `auth-required` state instead of the popup tab; an `ai_summaries.structured` manifest
classification added in the X1 commit was reverted because it made the expand-stage verification
fail in the feed integration suite.

## Verification

Locally, on this branch after merging `origin/main` (`df294d9`):

- `npm run test:extension`: 13 passed, twice in a row.
- `npm run lint`: 0 errors, the 4 warnings already on `main`. `npm run typecheck`: clean.
- `npx jest`: 2,041 of 2,042 passed. The failure, `dispatchers.unit.test.ts` "redelivers the
  inline message when the worker schedules a retry", is a fixed 20 ms wait in untouched queue
  code; it passed 3 of 3 runs in isolation.
- `npm run test:integration` against a scratch database on the local Docker Postgres
  (`DISTIL_TEST_POSTGRES_URL`): all 12 suites, 59 tests passed, including the RLS suite
  with the new connection tests. A leftover cluster role from an earlier run (`distil_lifecycle_test_app`)
  had to be dropped first; a failing suite also left the runner hanging on open handles.

Not verified: `npm run db:tenant:verify` on a fully migrated local database (on `main` it already
reports `ai_summaries.structured` as an unclassified JSON column; separate follow-up); the connect
page in a real browser with the real extension; anything on Preview or Production.

## External resources

None. Local Docker Postgres scratch databases only.

## Next

- Deploy order for X1: apply the stage before the code, because the new code names the columns
  (`npm run db:tenant:migrate -- --stage browser-connections --amit-user-id <uuid>` on
  Production, Amit's authorization), then merge. The stage is additive and safe for the running app.
- Migration number: PR #114 (Collections drop) also adds a 0014 stage. Whichever merges second
  renumbers its file and appends its stage to `distil_tenant_migrations_stage_check`.
- After X1 is live: load the 2.0 extension unpacked, sign in against Production, save a page,
  Disconnect in Settings, and confirm "Sign in again".
- Amit moves the extension private key into safe storage; losing it changes the pinned id.
- X3: unlisted Web Store listing, starting from `main` after X2 is verified.
