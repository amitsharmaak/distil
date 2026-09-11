# Distil — Architecture Notes

This document explains non-obvious design decisions that aren't apparent from reading the code or `AGENTS.md`. It's aimed at contributors who want to understand _why_ things work the way they do.

---

## Current hosted architecture

Production (`https://distilai.app`) runs the capture pipeline described in `AGENTS.md` §3:
`POST /api/v1/captures` → `src/lib/capture/service.ts` → Vercel Queue topic `capture-requests` →
`src/app/api/queue/capture-requests/route.ts` → `src/lib/capture/worker.ts`, backed by PostgreSQL
on Neon with forced row-level security.

### Why a 4-connection `postgres.js` client with `prepare: false`

`src/lib/postgres/client.ts` creates the runtime driver with `max: 4` and `prepare: false`.
Verified in code: both are the literal defaults in `createPostgresClient()`. Neon's connection
pooler runs in transaction mode, which does not support server-side prepared statements across
pooled connections, so `prepare: false` is required for correctness, not just efficiency; a low
connection cap keeps each serverless function instance from exhausting the pooler's shared
connection budget.

### Why the queue message carries only ids

`CaptureQueueMessageV2` (`src/lib/contracts/tenant-jobs.ts`) and the consumer in
`src/app/api/queue/capture-requests/route.ts` pass `userId`, `traceId`/`requestId` and the
capture id — verified by reading the route, which reconstructs an `AuthContext` from the message
and then loads everything else (`getTenantRepositories`) from the database. No captured URL,
content, or user data rides in the queue payload itself, which keeps queue messages small and
avoids re-deriving authorization from anything the client could forge in transit.

### Why receipts are durable before processing

`CaptureService.capture()` (`src/lib/capture/service.ts`) runs the SSRF guard
(`assertSafeUrl`) and normalized-URL dedupe (`normalizeCaptureUrl`,
`findActiveOrReadyByNormalizedUrl`) synchronously, writes a `queued` capture record, and only then
enqueues it. Verified: if enqueueing fails, the code transitions the record to `failed` rather
than losing it (see the `QueueUnavailableError` path). This guarantees every accepted capture has
a durable, queryable receipt (`queued → processing → ready | rejected | failed`, max 5 attempts
per `MAX_CAPTURE_ATTEMPTS` in `worker.ts`) even if the queue itself is unavailable at the moment
of submission.

### Why tenant context is transaction-local

`src/lib/postgres/tenant-repositories.ts` opens a Postgres transaction (`sql.begin(...)`) and
runs `set_config('app.user_id', ...)`, `set_config('app.actor_id', ...)`, etc. with the
`local` flag before any query. Verified in code. Because these settings are scoped to the
transaction (not the pooled connection), RLS policies keyed on `current_setting('app.user_id')`
can't leak across requests that happen to reuse the same physical connection from the pooler —
each transaction re-asserts its own tenant identity from a verified `AuthContext`.

### Why search degrades explicitly

Per `AGENTS.md` §3: PostgreSQL full-text search is the primary path; embeddings are optional
JSONB (no `pgvector`) and retrieval degrades explicitly rather than silently. This means a missing
or failed embedding step should fall back to FTS-only ranking instead of returning empty results.

### Why summaries validate before caching

`generateSummary()` (`src/lib/ai/summarize.ts`) parses every model response with a zod schema
(`summarySchema.safeParse`) inside `generate()` and throws `AIProviderError("invalid_output", ...)`
on failure — verified in code. The `repositories.summaries.upsert(...)` call that persists the
summary only runs after a successful parse, so a malformed or truncated model response never
overwrites a previously good cached summary.

---

## Legacy single-user path (compatibility only)

This section is retained only for the SQLite compatibility island (`src/lib/db.ts`, used when
`DATABASE_URL` is unset) and for connectors (Gmail, Slack, authenticated publishers) that exist in
code but are disabled in hosted deployments via `FEATURE_CONNECTORS=false`. Do not add new SQLite
code paths (`AGENTS.md` §3).

### Deduplication by normalized URL

Items are deduplicated using a normalized URL stored in the `normalized_url` column. Normalization
strips tracking parameters (`utm_*`), sorts query params, and removes fragments, so
`https://example.com/article?utm_source=email` and `https://example.com/article` resolve to the
same item. The hosted capture path applies the same normalized-URL dedupe idea, independently
implemented in `src/lib/capture/url-safety.ts`.

### processingStatus vs isRead

These are independent legacy states:

- `processingStatus` — lifecycle of the pipeline: `processing → ready | rejected`. Only `ready`
  items appear in the feed.
- `isRead` — user's reading state. A `ready` item starts unread; the user marks it read.

An item can be `processing` and unread, `ready` and read, or `rejected` (never shown to the user).
They are not related to each other.

### Intelligence pipeline stages (legacy)

Content ingested through the legacy SQLite path flows through five stages in
`src/lib/intelligence/pipeline.ts`:

```
RawContent → [1 Classify] → [2 Relevance Gate] → [3 Extract] → [4 Analyze] → [5 Enrich] → DB
```

1. **Classify** — AI assigns content type and, for emails, an `emailCategory`.
2. **Relevance gate** — non-email sources always pass; Gmail items must match an allowed category
   or Gmail header heuristics (`List-Unsubscribe`, `List-Id`, `Precedence: bulk`).
3. **Extract** — authenticated publisher session, then Readability + OG metadata, then email body
   stripping, in priority order.
4. **Analyze** — detects embedded media, extracts entities/links, computes an information-density
   heuristic.
5. **Enrich** — generates a short AI summary, assigns topic tags, computes a priority score.

### Fire-and-forget ingestion

The legacy `POST /api/items` route returns `202 Accepted` and runs the pipeline above in the
background, because the pipeline can take several seconds per item (network fetch + multiple AI
calls) and a synchronous response would time out the browser extension or block a Gmail sync. This
is distinct from the hosted capture path, which persists a durable receipt synchronously before
any background work starts (see above).

### Why SQLite (for this compatibility island)

SQLite keeps the legacy path zero-infrastructure: no external database needed to run it locally,
and the DB file is trivially backed up. WAL mode is enabled for concurrent reads. It is a fallback
only — the system of record for hosted deployments is PostgreSQL on Neon (`AGENTS.md` §3).
