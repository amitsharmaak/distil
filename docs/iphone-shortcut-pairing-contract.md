# iPhone pairing implementation contract

Baseline: `origin/main` at `4d06290` (X1/X2 and X3 merged). Integration owner: Codex
orchestrator, branch `codex/iphone-shortcut-pairing`. D1, D2 and D3 ship in one PR.
Migration `0016_phone_pairing.sql`, stage `phone-pairing`, requires `browser-connections`.
The SQL and interfaces in the initial contract commit are shared before delegation.

## API and domain contract

- `POST /api/v1/shortcut-pairings`: session plus `requireAllowedOrigin`; returns
  `{ code, expiresAt }` with 201 and private/no-store. Eight random Crockford base32 characters,
  displayed `XXXX-XXXX`, ten-minute validity, SHA-256 hash using the capture-token hash format.
- `POST /api/v1/shortcut-pairings/exchange`: no session; `{ code, deviceName? }`; returns
  `{ token }` once with private/no-store. Every invalid, expired or consumed code returns the
  same 401 `UNAUTHORIZED` envelope. Enforce pre-context IP limiting at `pairing:${ip}` before
  lookup, including malformed and unknown codes. Do not allow a session to bypass this limit.
- `GET /api/v1/capture-tokens`: all token summaries (never hashes/plaintext), including kind
  and label. Manual-token UI filters to manual; phone UI filters active phone rows.
- `DELETE /api/v1/capture-tokens/:id`: existing session/origin boundary, disconnects just that
  tenant's token. Phone tokens live until disconnected. Manual regeneration never touches phones
  or browsers; issuing a phone token revokes nothing.
- `createPairingCode(context, repository, options?)` returns `{ code, expiresAt }`.
  `exchangePairingCode(input, dependencies, options?)` returns `{ token }`;
  dependencies are `{ pairingIdentities, getTenantRepositories }` and options include `now`
  and `requestId`. Resolver method `resolveByHash(codeHash)` returns `{ pairingId, userId }`.
  Context is established from the exact resolver result (system actor for the bounded exchange),
  then tenant repository access rechecks all conditions atomically.
- `ShortcutPairingRepository` has `replacePending`, `findById`, and `exchange` as declared
  in `ports.ts`. Exchange creates the phone credential and consumes the code in one transaction;
  concurrent exchanges can return at most one token. Concurrent creation is serialized per tenant.
  Replacing a code marks the old pending row consumed (expired for authorization purposes).
- Never log codes, tokens, connection strings, or raw secret-bearing errors. Export no secret hashes.

## Wrong-guess decision

A wrong code has no exact hash match, hence no tenant/pairing can be identified. No fuzzy lookup
or cross-tenant pending-code scan is allowed. Proposed interpretation awaiting Amit: unknown
codes count against the IP limiter; the five-attempt guard applies to failed hash rechecks on
an already resolved row. The alternative requires adding a separate pairing identifier to the
protocol. Keep the exact-key boundary while the clarification is pending.

## File ownership and scheduling

The orchestrator owns this contract and the final new state-log entry. The orchestrator writes
no feature implementation after the shared contract commit. Every agent works on its own
sub-branch/worktree, runs focused checks, commits, and reports its SHA. No agent edits outside
its ownership; request missing files from the orchestrator first. No agent opens a PR or touches
Vercel, Neon, Production, another session's worktree, or an existing state entry.

- A, schema and inventory: `0016_phone_pairing.sql`, `src/lib/postgres/schema.ts`,
  `src/lib/postgres/tenant-migration/**`, their migration unit tests, `scripts/migrate-tenant.ts`,
  `scripts/verify-tenant-migration.ts`, `scripts/local-db-reset.ts`, `scripts/perf/measure-web-vitals.ts`,
  `scripts/rehearse-preview-clone.ts`, `tests/harness/**`, `tests/support/phase3-*`,
  `tests/fixtures/phase3/**`, `docs/authorization-matrix.json`,
  `docs/runbooks/tenant-isolation-incidents.md`, and migration stage lists in existing PostgreSQL
  integration suites. A owns no domain repository files.
- B, domain: `src/lib/repositories/ports.ts`, `src/lib/postgres/repositories.ts`,
  `src/lib/postgres/mappers.ts`, `src/lib/database.ts`, `src/lib/auth/capture-tokens.ts`,
  `src/lib/auth/shortcut-pairing.ts`, `src/lib/auth/shortcut-pairing-identity.ts`,
  corresponding auth unit tests and `src/lib/postgres/__tests__/repositories.unit.test.ts`,
  `mappers.unit.test.ts`, new pairing SQL-shape tests, and repository-set fake shape repairs.
  No new SQLite implementation; a legacy unsupported adapter may fail closed if shape requires it.
- C, routes/lifecycle: `src/app/api/v1/shortcut-pairings/**`, capture-token routes and route tests,
  `src/lib/auth/shortcut-pairing-rate-limit.ts` and its tests, `src/lib/auth/constants.ts`,
  `src/lib/auth/neon-proxy.ts`, `src/lib/middleware/auth.ts` and related boundary tests,
  `src/lib/lifecycle/**`, `src/lib/postgres/lifecycle-repositories.ts` and its unit tests.
  Own any narrowly required proxy changes. Do not edit inventory; send requirements to A.
- D, UI: `src/components/capture/iphone-shortcut-card.tsx`, its component test,
  `token-settings.tsx` and its test, `src/app/settings/page.tsx` and its tests,
  `src/lib/public-config.ts`, `src/lib/config.ts`, and keyboard-help UI if required.
- E, docs: `docs/iphone-shortcut.md`, `docs/user-guide.md`, `AGENTS.md`,
  `browser-extension/README.md`, `docs/vercel-deployment.md`.
- F, wave 2: new `src/lib/postgres/__tests__/shortcut-pairings.integration.test.ts`, with
  additional explicitly assigned integration test files only after wave 1 integration.
- G, wave 2: read-only independent full-diff review.

Three worker slots are available. A/B/C start together; D/E start when slots free. The
orchestrator integrates A, B, C, D, E in that order; F and G then run in parallel.

## Release boundary

Local verification and one PR with green CI are authorized. Stop for Amit before release.
Amit runs the read-only Production pre-check, owner migration stage, and post-check, then the
orchestrator merges only after explicit authorization. Amit builds/signs/shares the Shortcut,
sets `NEXT_PUBLIC_IOS_SHORTCUT_URL`, and performs physical-device acceptance.
