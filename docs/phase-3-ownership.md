# Phase 3 ownership and tenant-isolation foundation

Status: design and inventory baseline, not implemented

Inventory authority: [`docs/authorization-matrix.json`](authorization-matrix.json)

Baseline reviewed: `f208c551d56ae12c4ab0446d074230224e077915` on 2026-09-07

This document defines the authorization boundary for moving Distil from one protected user to real
accounts. It does not claim that the current schema or runtime is tenant-safe. The checked-in matrix
records both current enforcement and the required Phase 3 policy so it can drive generated tests and
implementation reviews.

## Boundary and ownership decision

For Phase 3, a tenant is one user account. Every persisted personal object has exactly one immutable
`user_id`, either directly or through a database-enforced parent relationship. Sessions, capture
tokens, jobs, connector credentials, search queries, AI context, caches, rate limits, logs, and
future object keys carry the same user identity from ingress to deletion.

Workspaces are a later sharing boundary, not a shortcut around personal ownership. A future shared
object may gain `workspace_id`, but it must retain an explicit creator/owner, require an active
membership and role check, and never infer access merely from a known object ID. Phase 3 code should
not create workspace-scoped rows until those semantics and lifecycle rules exist.

The required repository shape is an unforgeable server-created `TenantContext` passed as the first
argument to every personal read and write. It contains `userId`, actor kind and actor ID, plus trace
information; it never comes from a request body, URL, model output, queue payload alone, or a client
header. Resource lookups scope by tenant in the same SQL statement. Missing and foreign-owned IDs
both return `404`; mutations never perform a read-then-write authorization check across separate
transactions.

## Tenant data flow

```text
browser session / capture token / OAuth state / trusted service credential
                              |
                              v
                authenticate and construct TenantContext
                              |
                              v
 route or page loader -> tenant-aware repository / direct SQL adapter
                              |
                              +-> queue envelope {userId, actor, resourceId, jobId}
                              |                  |
                              |                  v
                              |       worker revalidates row ownership
                              |
                              +-> search filters by user before ranking
                              |                  |
                              |                  v
                              |       AI receives only authorized excerpts
                              |
                              +-> connector credentials and cursors scoped by user
                              |
                              +-> redacted log/audit event tagged with userId + traceId
                              v
                PostgreSQL rows and future object keys
```

Identity must be retained across every asynchronous boundary. A cron may enumerate eligible users,
but it enqueues one user-scoped job per account; it never runs a global digest or retrieval query.
A worker treats the signed queue envelope only as a request to start: before reading or mutating it
joins the addressed resource to the envelope's `user_id`. Retries and idempotency keys are unique
within a user, not globally.

## Authorization invariants

1. Authentication proves an actor; repository predicates prove ownership. Route authentication is
   not a substitute for tenant-scoped SQL.
2. All personal root tables have `user_id NOT NULL`. Child tables either carry `user_id` as a
   defense-in-depth key or use a composite foreign key that proves the parent has the same owner.
3. Global uniqueness on user content becomes tenant-relative. In particular, normalized URLs,
   digest dates, settings keys, OAuth provider/team pairs, token names, event keys, idempotency keys,
   and current-artifact constraints include `user_id` where appropriate.
4. Every object-ID route verifies all IDs in one tenant-scoped operation. Collection membership,
   annotation updates, citations, research source IDs, and approval resolution must reject mixed-
   owner graphs.
5. Lists, counts, aggregates, suggestions, recent-item fallbacks, status panels and admin-looking
   routes are tenant-scoped too. No empty filter means “all users.”
6. Search filters by `user_id` inside the candidate CTE before full-text/vector ranking, collection
   filtering, recent fallback, or answer-context assembly. AI providers receive the minimum excerpts
   needed, never another user's text, metadata, preferences, or conversation history.
7. Capture tokens belong to one user, have only capture-create permission, and cannot list receipts
   or inspect items. A capture row records its user and originating token/device. Token revocation is
   owner-scoped.
8. OAuth initiation creates a single-use, expiring, integrity-protected state bound to the signed-in
   user, provider, redirect URI and PKCE verifier. Callback storage uses that binding, not the browser
   session or provider account alone.
9. Logs never contain tokens, cookies, OAuth payloads, raw source content, prompts, answer text,
   selected quotations, extension queue bodies, or unredacted URLs/query strings. Operational logs
   carry opaque user/actor IDs; user-visible audit records are themselves tenant-owned.
10. Denials do not reveal whether a foreign object exists. Cross-tenant attempts are security audit
    events with bounded, privacy-safe metadata.
11. Account export and deletion traverse the same ownership graph. Deletion revokes sessions and
    tokens first, stops connectors/jobs, deletes future objects, then rows, with auditable completion.
12. Platform-wide maintenance is a distinct, short-lived service/admin capability with explicit
    reason and audit trail. A normal user session never gains cross-tenant list or mutation access.

## Concise threat model

| Threat                        | Representative path                                                                     | Required control                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Horizontal IDOR               | item, annotation, collection, capture, report, notification or approval ID              | Tenant predicate in the repository statement; foreign and missing both `404`; adversarial A/B tests                  |
| Cross-tenant list/search leak | feeds, full-text/vector search, recency fallback, counts, topics, agent RAG             | Filter candidates by user before joins/ranking/aggregation; assert every returned row has the principal's owner      |
| Asynchronous confused deputy  | capture queue, digest, summary, backfill, triage, research or connector job             | Signed service ingress, user-scoped envelope, ownership revalidation, tenant-relative idempotency                    |
| Credential substitution       | capture token, OAuth callback, publisher browser session                                | Token row contains user; OAuth state+PKCE binds user; per-user encrypted connector/session storage                   |
| Mixed-owner graph             | adding another user's item to a collection, claim evidence pointing to a foreign chunk  | Composite ownership foreign keys and atomic joins; reject mismatched owners                                          |
| AI context or memory bleed    | answer, summarize, prioritization, research, agent chat/tools                           | Tenant-scoped retrieval and conversation history; no process-global user caches; minimize provider payload           |
| Cache/rate-limit collision    | in-memory middleware buckets, tool limits, publisher status/locks                       | Keys include environment + user/actor + operation; shared backing store where correctness or quotas matter           |
| Log/telemetry exfiltration    | errors currently include URLs, item IDs, query snippets and arbitrary tool input/output | Central redaction/allowlist, tenant tag, retention/access policy; never persist raw tool parameters/results          |
| Global uniqueness denial/leak | normalized URL, digest date, event key, OAuth provider/team, idempotency key            | Tenant-relative unique indexes and conflict handling that cannot disclose another tenant's row                       |
| Local storage crossover       | SQLite DB, publisher profile/status files, browser extension queue/config               | Disable SQLite and process-local connector scheduler in hosted multi-user mode; namespace/encrypt local/client state |
| Privilege escalation          | `/api/admin/*`, approvals, system status, cron                                          | Explicit role/service principals; deny normal user cross-tenant operations; audited break-glass path                 |
| Orphaned data after deletion  | jobs, artifacts, embeddings, OAuth secrets, future blobs                                | Ownership graph, cascades plus deletion worker, tombstone/checkpoint, export/deletion verification                   |

## Current high-risk gaps

- All 36 PostgreSQL tables are currently single-user and none has `user_id`. Several global unique
  constraints would collide across tenants. The exact ownership migration target is in the matrix.
- Repository ports and the dual PostgreSQL/SQLite facade do not accept tenant context. Direct SQL in
  feed, digest and passage retrieval paths has no tenant predicate.
- The signed session proves only “the configured single user”; it has no account identity. Capture
  token principals contain a token ID but no user ID.
- Several legacy routes rely only on the global proxy, while server component
  `src/app/feed/[id]/page.tsx` reads the database directly. All need tenant-aware loaders/services.
- The digest cron currently requires both proxy session auth and `CRON_SECRET`; a provider cron has
  no user session. Phase 3 must expose only service-authenticated fan-out and enqueue per-user jobs.
- Vercel queue signature verification protects callback origin, but capture queue messages contain no
  tenant. The worker consequently cannot revalidate owner context.
- OAuth callbacks do not validate user-bound state/PKCE. OAuth tokens and publisher Playwright
  profiles are global by provider/team or publisher ID.
- Full-text, semantic, agent RAG, recency fallback, preferences, conversations, research and AI audit
  paths are unscoped. Some in-memory maps are global across users.
- Phase 2 now has a durable `regenerate_intelligence_summary` worker and grounded-summary runtime.
  Its queue payload has resource and trace IDs but no `userId`; prompt assembly, budget reads, artifact
  promotion, claims/evidence writes and audit deltas all use the global repository set. This entire
  graph must be revalidated under one tenant transaction before any content reaches the AI provider.
- Structured logger configuration has no redaction policy. Some calls log raw URLs or query prefixes;
  agent action persistence stores serialized parameters and results.
- The browser extension stores one plaintext token plus a shared queue in `chrome.storage.local`.
  Queue entries are not bound to a token/user, so changing accounts could replay older captures into
  the new account unless the queue is partitioned and cleared or explicitly migrated.
- There is no runtime object store today. Publisher browser state is local filesystem credential
  material and is not safe as a shared multi-user object-store design.

These are release blockers, not accepted residual risk. Multi-user exposure remains prohibited until
the matrix's required policy is implemented and generated cross-tenant tests pass.

## Machine-readable matrix contract

`docs/authorization-matrix.json` is deliberately data-only. A generator may use `apiRoutes` and
`pageLoaders` to create unauthenticated and user-A/user-B cases, `tables` and `dataAccessPaths` to
assert ownership predicates, and the remaining inventories to require tenant propagation at every
non-HTTP boundary.

Minimum generated cases for each personal operation are: no credential, valid owner, valid unrelated
user, malformed ID, deleted owner, and (for mutations) invalid origin/CSRF. Create paths must prove
that client-supplied owner fields are ignored. Service paths must prove invalid signature, missing
tenant envelope, foreign resource, replay and retry behavior. Search/AI cases must seed distinctive
canaries for two users and assert the foreign canary is absent from results, prompts, output, logs and
stored artifacts.

Inventory maintenance is a gate: extracted route-method pairs and Drizzle table names must equal the
matrix sets. Adding a route, table, worker, connector, search/AI entry point, storage location or raw
SQL adapter requires updating the matrix in the same change.

### Phase 2 delta checklist

This inventory has been refreshed from its original `9ed064f` baseline through Phase 2 commit
`f208c551d56ae12c4ab0446d074230224e077915`. It includes the grounded intelligence-summary runtime,
its durable worker, the new artifact repository completion methods, and the feature-gated Phase 2
routes and pages. When this work is integrated onto a newer Phase 2 commit, the integration owner must:

- diff `src/lib/postgres/schema.ts` and all migrations for added/renamed tables, relationships and
  uniqueness constraints;
- extract App Router API source files and exported methods, and page source files, then make their
  sets exactly match `apiRoutes` and `pageLoaders`;
- diff repository ports/adapters, `src/lib/database.ts`, direct SQL, scripts and import paths;
- diff registered job types, queue callbacks, crons, instrumentation timers and fire-and-forget
  promises;
- diff search, ranking, retrieval, prompt assembly, model calls, agent tools, conversations,
  preferences and AI audit paths;
- diff connector definitions, OAuth flows, sync cursors, publisher profiles, filesystem access,
  caches and locks;
- diff logger call sites, persisted audit/action payloads, rate limits, quotas and trace plumbing;
- diff extension/browser storage keys plus any new cache, upload, export or object-store interface;
- classify every delta with both current and required policy, update expected counts, and rerun the
  exact coverage and JSON/format checks before generated tests consume the matrix.

## Implementation sequence and exit evidence

1. Add identity/account/session contracts and a real `TenantContext`; remove the global single-user
   principal assumption.
2. Migrate root ownership and composite child constraints, then make all repository ports/adapters
   require context. Keep SQLite import as an explicitly user-targeted migration tool, not a hosted
   runtime fallback.
3. Convert routes, page loaders, direct SQL, jobs, connectors, search/AI and caches. Remove the legacy
   capture token path and process-local hosted schedulers.
4. Implement log redaction, user-scoped audit, quotas, export/deletion and future storage interface.
5. Generate and run matrix coverage plus database-enforced A/B tenant tests. Review query plans to
   confirm tenant-leading indexes and verify account deletion leaves no rows, queued work or objects.

Phase 3 ownership is complete only when the matrix is fully enforced, its inventory coverage check is
green, cross-tenant canary tests pass at route/repository/worker/search/AI layers, and no multi-user
feature flag can bypass the tenant context.
