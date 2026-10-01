-- Collections removal: drop the obsolete collections and collection_items tables. The feature code
-- was removed in PR #98 (0a1e350) and nothing reads or writes these tables any more. Apply only
-- after life-areas through `db:tenant:migrate -- --stage drop-collections`.
--
-- Deploy order: code first, then this stage. The same release removes the two tables from the
-- lifecycle export and account deletion; code that still exports them fails after the stage, while
-- the new code simply does not look for them. Nothing else reads or writes the tables (PR #98), so
-- the new code runs correctly against a database that still has them.
--
-- This stage DELETES DATA. Before it drops anything it records the row counts it is about to
-- remove with RAISE NOTICE (visible in the migration output). Production row counts are checked
-- and an optional lifecycle export or backup is taken before the stage is applied there.
--
-- Steps: extend the ledger stage check; drop the tenant_api views (they depend on the tables);
-- drop collection_items first (its composite foreign keys reference collections), then
-- collections. Dropping a table also drops its row-level-security policies, indexes, constraints
-- and grants, so those need no separate statements: the collections_user_id_id_idx unique index,
-- collection_items_user_membership_idx, collection_items_item_idx, collection_items_order_idx, the
-- user_id indexes from 0005, and the composite and item foreign keys go with the tables. Nothing
-- else references either table (verified in 0005-0008: only their own constraints and views).
--
-- Historical item_events rows with event_type 'collection_added' or 'collection_removed', and the
-- value list in item_events_event_type_check (0002), are deliberately left alone: the rows are
-- audit history, and narrowing the constraint would need a validating table scan for no benefit.
--
-- Idempotent, inside the ledger transaction: every drop uses IF EXISTS and the count block is
-- guarded by to_regclass. Rollback is a restore only: the data cannot be recreated from this
-- stage. Re-create the tables from 0002, 0005 and 0007 (columns, user_id, composite unique
-- index, foreign keys, RLS policies, tenant_api views and grants) and load rows from the backup
-- or lifecycle export taken before the stage. Applying the stage twice on an already-migrated
-- database is a no-op.

ALTER TABLE distil_tenant_migrations
  DROP CONSTRAINT IF EXISTS distil_tenant_migrations_stage_check;
ALTER TABLE distil_tenant_migrations
  ADD CONSTRAINT distil_tenant_migrations_stage_check
  CHECK (stage IN ('expand','backfill','contract','lifecycle','returning-auth','perf-indexes','summary-structure','feed-search','life-areas','drop-collections'));

DO $drop_collections_counts$
DECLARE
  collections_count bigint;
  collection_items_count bigint;
BEGIN
  IF to_regclass('public.collection_items') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.collection_items' INTO collection_items_count;
    RAISE NOTICE 'drop-collections: deleting % collection_items row(s)', collection_items_count;
  ELSE
    RAISE NOTICE 'drop-collections: collection_items already absent';
  END IF;
  IF to_regclass('public.collections') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.collections' INTO collections_count;
    RAISE NOTICE 'drop-collections: deleting % collections row(s)', collections_count;
  ELSE
    RAISE NOTICE 'drop-collections: collections already absent';
  END IF;
END
$drop_collections_counts$;

DROP VIEW IF EXISTS tenant_api.collection_items;
DROP VIEW IF EXISTS tenant_api.collections;
DROP TABLE IF EXISTS public.collection_items;
DROP TABLE IF EXISTS public.collections;
