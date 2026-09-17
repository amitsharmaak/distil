-- Performance P7: the tenant-scoped index for personalization signals and the
-- ai_summaries.content_hash column P6 left un-keyed. Apply only after returning-auth through
-- `db:tenant:migrate -- --stage perf-indexes`.
--
-- Both statements are additive and idempotent and run inside the ledger transaction (no
-- CONCURRENTLY: it cannot run in a transaction and the Production library is tiny, so the brief
-- lock is accepted). Rollback: DROP INDEX item_events_user_type_occurred_idx;
-- ALTER TABLE ai_summaries DROP COLUMN content_hash.
--
-- Deliberately NOT created (see the P7 checkpoint in docs/project-state.md): the runtime role is
-- subject to forced row-level security, so PostgreSQL plans every tenant table as a
-- security-barrier subquery in isolation. An ordered index on items(user_id, created_at DESC,
-- id DESC) can never serve the feed's outer ORDER BY ... LIMIT (a top-N sort over the tenant's
-- candidate rows always remains), and a GIN index on items(topics) is unreachable because `?|`
-- and `?` are not leakproof and are evaluated above the barrier. Equality and `= ANY`
-- predicates are leakproof and do push down, which is why the item_events index below works.

ALTER TABLE distil_tenant_migrations
  DROP CONSTRAINT IF EXISTS distil_tenant_migrations_stage_check;
ALTER TABLE distil_tenant_migrations
  ADD CONSTRAINT distil_tenant_migrations_stage_check
  CHECK (stage IN ('expand','backfill','contract','lifecycle','returning-auth','perf-indexes'));

-- Personalization affinity: explicit signals per tenant, by event type. The feed's LATERAL
-- subquery filters e.user_id = $1 AND e.event_type IN (...), both leakproof.
CREATE INDEX IF NOT EXISTS item_events_user_type_occurred_idx
  ON item_events(user_id, event_type, occurred_at DESC);

-- Cache key input for generated summaries; written and read by a later AI task.
ALTER TABLE ai_summaries
  ADD COLUMN IF NOT EXISTS content_hash text;
