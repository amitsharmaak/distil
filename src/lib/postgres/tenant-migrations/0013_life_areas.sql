-- Life areas F2: every item gets one of four areas (personal, work, learning, updates), assigned
-- by AI at capture and correctable by Amit. Apply only after feed-search through
-- `db:tenant:migrate -- --stage life-areas`. In F2 only the area classifier reads and writes these
-- columns, and a failed classification never fails a capture, so the code may deploy first; items
-- captured before the stage simply stay unclassified until the F6 backfill. The stage must be
-- applied before F3, whose item projections select area and manual_area.
--
-- area, area_confidence, area_reason, area_model, area_classified_at: the AI's latest answer.
-- Reclassification only ever writes these.
-- manual_area, manual_area_at: Amit's correction (F4). Reprocessing never touches them; the
-- effective area is COALESCE(manual_area, area). Corrections (manual_area set and different
-- from area) are fed back to the classifier as examples.
--
-- Every column is nullable and additive; existing rows keep NULL until the F6 backfill. The
-- expression index serves the F3 area filter: COALESCE and text equality are leakproof, so the
-- predicate pushes below the row-level-security barrier (see 0010 and 0012).
--
-- Idempotent, inside the ledger transaction. The tenant_api.items view is rebuilt because
-- PostgreSQL expands SELECT * when a view is created. Rollback: recreate the view with the
-- previous column list, DROP INDEX items_user_effective_area_idx, then ALTER TABLE items DROP
-- CONSTRAINT for the three checks and DROP COLUMN for the seven columns.

ALTER TABLE distil_tenant_migrations
  DROP CONSTRAINT IF EXISTS distil_tenant_migrations_stage_check;
ALTER TABLE distil_tenant_migrations
  ADD CONSTRAINT distil_tenant_migrations_stage_check
  CHECK (stage IN ('expand','backfill','contract','lifecycle','returning-auth','perf-indexes','summary-structure','feed-search','life-areas'));

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS area_confidence double precision,
  ADD COLUMN IF NOT EXISTS area_reason text,
  ADD COLUMN IF NOT EXISTS area_model text,
  ADD COLUMN IF NOT EXISTS area_classified_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_area text,
  ADD COLUMN IF NOT EXISTS manual_area_at timestamptz;

ALTER TABLE items DROP CONSTRAINT IF EXISTS items_area_check;
ALTER TABLE items
  ADD CONSTRAINT items_area_check
  CHECK (area IS NULL OR area IN ('personal','work','learning','updates'));
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_manual_area_check;
ALTER TABLE items
  ADD CONSTRAINT items_manual_area_check
  CHECK (manual_area IS NULL OR manual_area IN ('personal','work','learning','updates'));
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_area_confidence_check;
ALTER TABLE items
  ADD CONSTRAINT items_area_confidence_check
  CHECK (area_confidence IS NULL OR (area_confidence >= 0 AND area_confidence <= 1));

CREATE INDEX IF NOT EXISTS items_user_effective_area_idx
  ON items(user_id, (COALESCE(manual_area, area)));

-- Same statement as 0007; new columns append after the existing ones, so CREATE OR REPLACE
-- keeps every column the runtime already reads.
CREATE OR REPLACE VIEW tenant_api.items WITH (security_barrier=true) AS
  SELECT * FROM public.items
  WHERE user_id = nullif(current_setting('app.user_id', true), '')::uuid
  WITH CASCADED CHECK OPTION;
ALTER VIEW tenant_api.items OWNER TO distil_migration;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_api.items TO distil_runtime;
