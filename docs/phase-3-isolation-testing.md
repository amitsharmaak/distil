# Phase 3 tenant-isolation test architecture

This test layer makes the Phase 3 exit gate measurable: an unrelated user must not be able to
observe, infer, mutate, enqueue, retrieve, or prompt with another user's data. The helpers are
test-only and production-adapter-neutral so ownership, auth, repository, and worker changes can land
independently.

## Locked test contracts

Wave 1 production code must expose compatible shapes (the production types do not need to import
the test module):

```ts
interface AuthContext {
  userId: string;
  actorKind: "user" | "capture-token" | "system";
  actorId: string;
  sessionId?: string;
  requestId: string;
}

interface CaptureQueueMessageV2 {
  version: 2;
  userId: string;
  captureId: string;
  traceId: string;
}

interface TenantJobEnvelopeV1 {
  version: 1;
  userId: string;
  jobId: string;
  jobType: string;
  traceId: string;
}
```

`tests/support/phase3-tenancy.ts` supplies two unrelated users, actor contexts, owned resource ids,
valid queue envelopes, and forged envelopes. Route bodies and queue payloads must never
be allowed to override `AuthContext.userId`. Consumers must resolve resources with both `userId` and
the resource id; a syntactically valid beta envelope naming an alpha resource is a denial case.

## Authorization matrix

`tests/support/authorization-matrix.ts` provides:

- a JSON loader and validator with decisions for every actor kind;
- semantic checks that tenant-bound users are `own` or `deny`, never unscoped `allow`;
- mandatory cross-tenant existence concealment for user-owned resources;
- bidirectional coverage checks, so newly added and stale surfaces both fail;
- Next route discovery with normalized dynamic paths such as `/api/items/:id`.

`tests/fixtures/phase3/authorization-matrix.valid.json` remains a compact schema fixture.
`tests/fixtures/phase3/phase2-wave0-route-surfaces.json` is the frozen 96-surface Phase 2 + Wave 0
route inventory. `createPhase2Wave0AuthorizationMatrix()` creates the least-privilege review matrix
from that explicit inventory; discovery is compared in both directions so adding, removing, or
renaming a route fails review rather than receiving a default policy. The worker inventory is also
explicit (`worker:capture`, `worker:durable-job`).

```ts
const routeSurfaces = discoverNextRouteSurfaces(resolve(process.cwd(), "src/app/api"));
const workerSurfaces = ["worker:capture", "worker:durable-job"];
const inventory = loadRouteSurfaceInventory(
  resolve(process.cwd(), "tests/fixtures/phase3/phase2-wave0-route-surfaces.json")
);
assertRouteSurfaceInventory(inventory, routeSurfaces);
const matrix = createPhase2Wave0AuthorizationMatrix(inventory);

assertAuthorizationCoverage(matrix, [...inventory, ...workerSurfaces]);
```

Every route method is a separate surface. `OPTIONS` may be public only where it performs no tenant
work. Workers are explicit inventory entries because static discovery cannot reliably distinguish a
worker entry point from a helper.

## PostgreSQL and pool isolation

The database is the final tenant boundary. Wave 1 migrations should satisfy these invariants for
every tenant-owned table:

- an immutable, `NOT NULL` `user_id` with a foreign key;
- row-level security enabled and forced;
- policies for select, insert, update, and delete that bind the row tenant to
  `current_setting('app.user_id', true)`;
- tenant-scoped business uniqueness, for example `(user_id, normalized_url)`, rather than global
  uniqueness that lets one tenant affect another;
- a restricted application role that is neither a superuser nor the table owner.

`TenantRlsPoolHarness` uses parameterized `set_config('app.user_id', userId, true)`, the equivalent of
`SET LOCAL`, inside a transaction. Production request/job code must use the same transaction-local
pattern. A session-level `SET app.user_id` is unsafe with pooling and is not an accepted interface.

`tests/security/phase3-rls.integration.test.ts` is automatically discovered by the existing
PostgreSQL integration runner. It initially appears as skipped without starting Docker. It activates
only after the migration source includes `user_id`, `ENABLE` and `FORCE ROW LEVEL SECURITY`, a policy,
and an explicit marker for every table in the immutable 36-table Phase 2 + Wave 0 manifest. A
`workspace_id` migration, a one-table probe, or a partial tenant migration cannot activate this gate;
workspaces remain Phase 6. Once active it:

1. inspects real migrated catalogs for every manifest table: ownership, foreign key, composite
   ownership relationships, RLS + FORCE RLS, all CRUD policies, and scoped uniqueness;
2. connects as a non-superuser, non-owner, non-`BYPASSRLS` application role;
3. proves context-free reads and writes fail closed, then exercises select/update/delete/insert under
   that restricted role;
4. alternates alpha, beta, and alpha through one pooled connection and proves the setting is absent
   after commit and after rollback.

The invariant list is generated directly from `tenantMigrationManifest`; do not hand-maintain a
smaller core-table list or weaken the activation detector to keep a partial migration green. Once the
full migration handoff is present, missing protection is a failing gate.

## Adversarial catalog

`tests/fixtures/phase3/negative-test-catalog.json` is the threat-driven backlog. Wave 1 gate cases
cover authentication, identifier guessing, nested-resource mixing, repository predicates, database
RLS, pooled connections, forged capture/job envelopes, search, and outbound AI context. Phase 3 exit
cases cover caches, quotas, logs, and object storage as those shared services are introduced.

Each implemented test should retain the catalog id in its test name. For cross-tenant resources,
assert both non-disclosure and absence of side effects: no status transition, fetched URL, item write,
provider call, queue dispatch, cache entry, or audit content belonging to the attacker.

## Pending production interfaces

`tests/security/phase3-boundaries.integration.test.ts` compiles now and activates each boundary
independently through the precise `DISTIL_PHASE3_ISOLATION_ADAPTER` test-only module signal. The module
must export `phase3IsolationAdapters` and may expose `routes`, `repositories`, `queue`, and
`coexistence` separately. Each available adapter immediately gates its own concern; unavailable
interfaces alone are skipped, never a blanket Phase 3 suite skip. Reuse the assertions in
`tests/support/phase3-isolation.ts`:

- `assertCrossTenantNotFound` proves cross-user reads return the identical 404/body as unknown ids.
- `assertRepositoryIsolation` checks list, lookup, update, and delete paths.
- `assertForgedQueueEnvelopesRejected` runs every malformed and cross-user queue envelope and checks
  that no effect occurs.
- `assertTenantScopedCoexistence` requires the same normalized URL, digest date, and preference key
  to succeed for both users.

## Wave 1 integration checklist

- Define production `AuthContext` and construct it once at the authenticated boundary.
- Make tenant context mandatory in repository and service entry points; never add a fallback user.
- Use not-found-equivalent responses for guessed resources owned by another tenant.
- Emit only `CaptureQueueMessageV2` for capture work and wrap durable jobs in
  `TenantJobEnvelopeV1`; reject legacy/unscoped or extra-field envelopes before work begins.
- Resolve capture/job records by the pair `(userId, resourceId)` and verify stored ownership.
- Set `app.user_id` transaction-locally for every repository unit of work and use a restricted runtime
  role in deployed environments.
- Add a reviewed full authorization matrix and explicit worker inventory to the security suite.
- Parameterize consumer tests over `forgedQueueEnvelopeFixtures()` and route/repository tests over
  `createTwoTenantFixture()`.

`npm run test:phase3-isolation` runs the deterministic fixture, matrix, activation, and adapter
assertion tests in CI. The existing `npm run test:integration` runner automatically includes the
PostgreSQL RLS and boundary-adapter integration suites.

The normal unit suite validates fixture determinism, matrix/catalog structure, source inventory, and
migration activation. Hosted services are never contacted.
