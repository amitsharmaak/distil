-- Browser connections X1: a browser extension signs in through the Distil web app and receives a
-- token minted for that browser alone, so no user ever copies a capture token. A connection is an
-- ordinary capture_tokens row with kind 'browser' and a human label ("Chrome on macOS"); the
-- account's manual token (kind 'manual', used by the iPhone Shortcut and scripts) is untouched.
-- Apply only after life-areas through `db:tenant:migrate -- --stage browser-connections`.
--
-- The change is additive and safe for the running app: kind defaults to 'manual', so every
-- existing row and every insert from code that predates this stage stays a manual token, and
-- authentication (distil_resolve_capture_token) does not read the new columns. The code that
-- writes kind and label must be deployed after this stage, because it names the columns.
--
-- Numbering note: other in-flight branches may also add 0014 and extend
-- distil_tenant_migrations_stage_check. Whichever merges later renumbers this file and appends its
-- stage to the list below.
--
-- Idempotent, inside the ledger transaction. The tenant_api.capture_tokens view is rebuilt because
-- PostgreSQL expands SELECT * when a view is created. Rollback: recreate the view with the
-- previous column list, then ALTER TABLE capture_tokens DROP CONSTRAINT capture_tokens_kind_check,
-- DROP CONSTRAINT capture_tokens_label_check, DROP COLUMN kind, DROP COLUMN label.

ALTER TABLE distil_tenant_migrations
  DROP CONSTRAINT IF EXISTS distil_tenant_migrations_stage_check;
ALTER TABLE distil_tenant_migrations
  ADD CONSTRAINT distil_tenant_migrations_stage_check
  CHECK (stage IN ('expand','backfill','contract','lifecycle','returning-auth','perf-indexes','summary-structure','feed-search','life-areas','browser-connections'));

ALTER TABLE capture_tokens
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS label text;

ALTER TABLE capture_tokens DROP CONSTRAINT IF EXISTS capture_tokens_kind_check;
ALTER TABLE capture_tokens
  ADD CONSTRAINT capture_tokens_kind_check
  CHECK (kind IN ('manual','browser'));
ALTER TABLE capture_tokens DROP CONSTRAINT IF EXISTS capture_tokens_label_check;
ALTER TABLE capture_tokens
  ADD CONSTRAINT capture_tokens_label_check
  CHECK (label IS NULL OR char_length(label) <= 120);

-- Same statement as 0007; new columns append after the existing ones, so CREATE OR REPLACE
-- keeps every column the runtime already reads.
CREATE OR REPLACE VIEW tenant_api.capture_tokens WITH (security_barrier=true) AS
  SELECT * FROM public.capture_tokens
  WHERE user_id = nullif(current_setting('app.user_id', true), '')::uuid
  WITH CASCADED CHECK OPTION;
ALTER VIEW tenant_api.capture_tokens OWNER TO distil_migration;
