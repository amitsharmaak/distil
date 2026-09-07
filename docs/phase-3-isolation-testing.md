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

`tests/fixtures/phase3/authorization-matrix.valid.json` is a schema fixture, not the complete product
matrix. Wave 1 should add the reviewed matrix under `tests/security` and gate it as follows:

```ts
const routeSurfaces = discoverNextRouteSurfaces(resolve(process.cwd(), "src/app/api"));
const workerSurfaces = ["worker:capture", "worker:durable-job"];
const matrix = loadAuthorizationMatrix(
  resolve(process.cwd(), "tests/security/authorization-matrix.json")
);

assertAuthorizationCoverage(matrix, [...routeSurfaces, ...workerSurfaces]);
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
when the migration directory contains all three signals: a `user_id` column, RLS enablement, and a
policy. A `workspace_id` migration cannot activate this gate; workspaces remain Phase 6. Once active
it:

1. inspects real migrated catalogs for ownership, foreign-key, RLS, policy, and scoped-unique-key
   invariants on core tables;
2. connects as a restricted role through a one-connection pool;
3. alternates alpha, beta, and alpha actor contexts and proves each sees only its own same-id row;
4. proves the setting is absent after commit and after rollback.

Extend the invariant table list in the same test as Wave 1 partitions the remaining personal tables.
Do not weaken the activation detector to keep a partial migration green; once tenant migrations
start, missing core protection is a failing gate.

## Adversarial catalog

`tests/fixtures/phase3/negative-test-catalog.json` is the threat-driven backlog. Wave 1 gate cases
cover authentication, identifier guessing, nested-resource mixing, repository predicates, database
RLS, pooled connections, forged capture/job envelopes, search, and outbound AI context. Phase 3 exit
cases cover caches, quotas, logs, and object storage as those shared services are introduced.

Each implemented test should retain the catalog id in its test name. For cross-tenant resources,
assert both non-disclosure and absence of side effects: no status transition, fetched URL, item write,
provider call, queue dispatch, cache entry, or audit content belonging to the attacker.

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

The normal unit suite validates fixture determinism, matrix/catalog structure, source inventory, and
migration activation. Hosted services are never contacted.
