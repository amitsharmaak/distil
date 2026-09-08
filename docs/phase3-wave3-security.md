# Phase 3 Wave 3 security/privacy workstream

## State

- Owner: Wave 3 security/privacy harness stream.
- Branch: `codex/p3-wave3-security`.
- Frozen base: `428a0b023e2295b59fe864efeb2b26047b0ed6fa`.
- Product flags: unchanged and disabled.
- Scope: test, harness, deterministic audit, and authorization-matrix corrections only.
- Excluded: production lifecycle/account changes, migrations, schema changes, external calls,
  provisioning, Preview, Production, and real users.

## Delivered harness contracts

- Full source-to-matrix inventory for API method/path surfaces, page loaders, Drizzle tables, and
  workers. Missing, stale, duplicate, renamed, and incompletely classified entries fail closed.
- Generated CSRF review from every cookie-authenticated owner mutation. Exemptions are durable,
  narrow, and limited to verified dormant routes or capture-route composition.
- Two-user export assertions for top-level allowlisting, recursive secret-key rejection, sensitive
  canaries, tenant-content exclusion, and indistinguishable foreign/missing downloads.
- Two-user deletion assertions for disable/revocation-before-purge, duplicate worker delivery,
  tenant isolation, terminal cleanup, and a claimed-job/deletion race.
- Invitation request/completion concurrency, OAuth owner/session/provider/single-use semantics,
  log-redaction canaries, and queue duplicate/retry/forgery assertions.
- Early Wave 4 seams for deterministic outages and barriers, export/deletion recovery, tenant-aware
  query plans, and concurrent PostgreSQL pool/RLS pressure.
- Offline dependency gate for exact Neon Auth pin/lock agreement, Better Auth peer compatibility,
  and production dependency license metadata.
- Corrected shared tenant fixtures: user actors now use the authenticated user UUID and system
  actors use a valid UUID. Added stable lifecycle, OAuth, and secret canaries.

The integration adapter inventory is exact and rejects partial or extra adapters. It currently
requires: `csrf`, `export`, `deletion`, `deletionQueueRace`, `session`, `invitation`, `oauthState`,
`logging`, `queue`, `queryPlans`, and `recovery`.

The lifecycle surface fixture deliberately locks the sibling implementation to these additions:

- `POST /api/v1/account/export`
- `GET /api/v1/account/exports/:id`
- `GET /api/v1/account/exports/:id/download`
- `POST /api/v1/account/deletion`
- `DELETE /api/v1/account/deletion`
- `GET /api/v1/account/usage`
- `worker:account-export`
- `worker:account-deletion`

## Frozen-base release findings

`npm run audit:phase3-security` is an intentional failing release gate at the frozen base. It
reports 24 findings; this workstream does not change the affected product implementation.

### CSRF coverage (17)

These cookie-authenticated mutations do not directly enforce an allowed Origin. The legacy session
proxy supplies an origin check, but the Neon proxy path does not, so enabling Neon Auth would expose
the gap:

- `DELETE /api/ai/research/suggestions/:id`
- `DELETE /api/items/:id`
- `PATCH /api/items/:id`
- `PATCH /api/notifications/:id`
- `POST /api/agent/approvals`
- `POST /api/agent/chat`
- `POST /api/ai/feedback`
- `POST /api/ai/prioritize`
- `POST /api/ai/research`
- `POST /api/ai/research/proactive`
- `POST /api/ai/research/suggestions/:id/start`
- `POST /api/ai/summarize`
- `POST /api/items/:id/extract`
- `POST /api/notifications`
- `POST /api/settings/email-intelligence`
- `PUT /api/ai/preferences`
- `PUT /api/notifications/preferences`

### OAuth, invitation, and logging (4)

- `normalizeConnectorReturnPath("/\\hostile.example")` accepts a browser-interpreted external
  redirect path.
- The OAuth repository consumes by nonce/provider before user and session validation. A claimant
  who learns a nonce cannot use it, but can destructively burn another user's state.
- Repeated or concurrent valid invitation requests can each reach the magic-link provider because
  dispatch has no durable per-invitation claim or rate control.
- The Pino singleton has no central redaction/allowlist. Existing security-test output confirms an
  `Error.message` can be logged verbatim.

### Dependencies and licenses (3)

- `@better-auth/api-key` requires `better-auth ^1.7.3`, while the Neon Auth UI subtree resolves
  `1.6.23`.
- `@triplit/client@1.0.50` declares `AGPL-3.0-only` in the production lock graph.
- `ua-parser-js@2.0.10` declares `AGPL-3.0-or-later` in the production lock graph.

The two license findings are policy review blockers based on committed lockfile metadata; they are
not a legal conclusion.

## Verification

- `npm run test:phase3-isolation`: 7 suites, 46 tests passed.
- `npm run test:phase3-security`: 3 suites, 25 tests passed.
- `npm run test:security`: 31 suites, 273 tests passed.
- `npm run test:integration`: 10 PostgreSQL suites, 32 tests passed, including concurrent pool/RLS
  pressure.
- `npm run typecheck`: passed.
- `npm run lint`: passed with 10 pre-existing warnings and no errors.
- Changed-file Prettier check: passed.
- Repository-wide `npm run format:check`: fails on 47 pre-existing files outside this workstream.
- `npm run audit:phase3-dependencies`: expected failure with the three dependency/license findings.
- `npm run audit:phase3-security -- --json`: expected failure with the 24 release findings above.

## Integration and operations

- No migration, schema, runtime configuration, flag, secret, deployment, or operator action is
  introduced by this branch.
- Cherry-pick this harness before or with the lifecycle implementation. Update the authorization
  matrix for the six locked lifecycle routes, two workers, and new tables in the same integration
  commit; the full inventory gate must remain enabled.
- Implement adapters against the public lifecycle and object-store ports, then run the generated
  assertions against actual routes/repositories/workers. Do not replace them with self-test fakes at
  release acceptance.
- Resolve or explicitly disposition every deterministic audit finding before enabling Phase 3 flags.

## Limitations and restart

- The frozen base has no lifecycle implementation to wire, so the new reusable assertions are
  self-tested adapters plus source-derived gates. PostgreSQL RLS pool pressure is exercised against
  the actual frozen schema.
- Query-plan and lifecycle outage/recovery assertions need integration adapters after the sibling
  lifecycle branch lands.
- To resume: start at this branch commit, cherry-pick the lifecycle implementation, reconcile its
  exact files with `tests/fixtures/phase3/wave3-lifecycle-surfaces.json`, update the matrix without
  weakening counts or profiles, wire all required adapters, and rerun the verification commands
  above.
