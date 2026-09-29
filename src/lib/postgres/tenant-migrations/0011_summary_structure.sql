-- Adaptive summaries S1: keep the model's structured output and the prompt version next to each
-- rendered summary. The content-aware brief (summary-v2) stores its sections and the questions
-- it leaves open in `structured`; the detailed summary built in S2 reads them. Apply only after
-- perf-indexes through `db:tenant:migrate -- --stage summary-structure`, and before deploying
-- the code that writes these columns.
--
-- Both columns are nullable and additive; existing rows keep NULL and render as before.
-- Idempotent, inside the ledger transaction. The tenant_api.ai_summaries contract view is
-- rebuilt because PostgreSQL expands SELECT * when a view is created; this also exposes
-- content_hash (added by 0010 but never visible to the runtime role). Rollback: recreate the view
-- with the previous column list, then ALTER TABLE ai_summaries DROP COLUMN structured,
-- DROP COLUMN prompt_version.

ALTER TABLE distil_tenant_migrations
  DROP CONSTRAINT IF EXISTS distil_tenant_migrations_stage_check;
ALTER TABLE distil_tenant_migrations
  ADD CONSTRAINT distil_tenant_migrations_stage_check
  CHECK (stage IN ('expand','backfill','contract','lifecycle','returning-auth','perf-indexes','summary-structure'));

ALTER TABLE ai_summaries
  ADD COLUMN IF NOT EXISTS structured jsonb,
  ADD COLUMN IF NOT EXISTS prompt_version text;

-- Same statement as 0007/0008; new columns append after the existing ones, so CREATE OR REPLACE
-- keeps every column the runtime already reads.
CREATE OR REPLACE VIEW tenant_api.ai_summaries WITH (security_barrier=true) AS
  SELECT * FROM public.ai_summaries
  WHERE user_id = nullif(current_setting('app.user_id', true), '')::uuid
  WITH CASCADED CHECK OPTION;
ALTER VIEW tenant_api.ai_summaries OWNER TO distil_migration;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_api.ai_summaries TO distil_runtime;
