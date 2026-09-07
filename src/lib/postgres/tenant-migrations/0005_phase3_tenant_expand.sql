-- Phase 3 expand: additive only. Existing application rows remain writable while
-- every ownership column is nullable. Apply through the dedicated tenant migrator.

CREATE OR REPLACE FUNCTION distil_current_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
AS $phase3_context$
DECLARE
  configured_user_id text := nullif(current_setting('app.user_id', true), '');
BEGIN
  IF configured_user_id IS NULL THEN
    RAISE EXCEPTION 'app.user_id is required for tenant data access';
  END IF;
  RETURN configured_user_id::uuid;
END
$phase3_context$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  primary_email text,
  display_name text,
  status text NOT NULL DEFAULT 'migration_pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT users_status_check
    CHECK (status IN ('migration_pending','active','suspended','deletion_pending','deleted'))
);

CREATE TABLE IF NOT EXISTS auth_identities (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_subject text NOT NULL,
  email text,
  email_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject),
  UNIQUE (user_id, id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY,
  normalized_email text NOT NULL,
  email_hash text NOT NULL,
  token_salt text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  issued_by_actor_id uuid NOT NULL,
  issuance_reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  consumed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  consumed_at timestamptz,
  revoked_by_actor_id uuid,
  revoke_reason text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitations_status_check
    CHECK (status IN ('pending','accepted','revoked','expired')),
  CONSTRAINT invitations_acceptance_check
    CHECK (status <> 'accepted' OR (consumed_by_user_id IS NOT NULL AND consumed_at IS NOT NULL)),
  CONSTRAINT invitations_revocation_check
    CHECK (status <> 'revoked' OR
      (revoked_by_actor_id IS NOT NULL AND revoke_reason IS NOT NULL AND revoked_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS session_metadata (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_hash text NOT NULL UNIQUE,
  device_label text,
  last_used_at timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);

CREATE TABLE IF NOT EXISTS account_exports (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  object_ref text,
  content_hash text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  download_expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  purge_after timestamptz NOT NULL DEFAULT now() + interval '7 days',
  UNIQUE (user_id, id),
  CONSTRAINT account_exports_status_check
    CHECK (status IN ('pending','running','ready','failed','expired'))
);

CREATE TABLE IF NOT EXISTS account_deletions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested',
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_at timestamptz NOT NULL DEFAULT now(),
  purge_after timestamptz NOT NULL DEFAULT now() + interval '7 days',
  cancelled_at timestamptz,
  cancelled_by_actor_id uuid,
  cancellation_reason text,
  completed_at timestamptz,
  UNIQUE (user_id, id),
  CONSTRAINT account_deletions_status_check
    CHECK (status IN ('requested','draining','purging','completed','cancelled','failed')),
  CONSTRAINT account_deletions_checkpoint_check
    CHECK (jsonb_typeof(checkpoint) = 'object'),
  CONSTRAINT account_deletions_cancellation_check
    CHECK (status <> 'cancelled' OR
      (cancelled_at IS NOT NULL AND cancelled_by_actor_id IS NOT NULL
        AND cancellation_reason IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS usage_counters (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  billing_date date NOT NULL,
  operation text NOT NULL,
  provider text NOT NULL DEFAULT '',
  request_count integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cost_microusd bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, billing_date, operation, provider),
  CONSTRAINT usage_counters_nonnegative_check CHECK (
    request_count >= 0 AND input_tokens >= 0 AND output_tokens >= 0 AND cost_microusd >= 0
  )
);

CREATE TABLE IF NOT EXISTS user_entitlements (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entitlement text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'system',
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entitlement)
);

DO $phase3_expand$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'items','item_notes','annotations','collections','collection_items','item_events',
    'digest_runs','digest_items','personal_preferences','digest_jobs',
    'item_content_versions','content_chunks','intelligence_artifacts','intelligence_claims',
    'claim_evidence','knowledge_backfill_checkpoints','oauth_tokens','ai_summaries','feedback',
    'research_reports','research_suggestions','user_settings','notifications','item_embeddings',
    'audit_log','workflow_runs','agent_actions','approval_queue','chat_conversations',
    'chat_messages','job_queue','publisher_queue','raw_content','capture_requests',
    'capture_tokens','rate_limit_windows'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS user_id uuid', table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (user_id)',
      table_name || '_user_idx', table_name);
  END LOOP;
END
$phase3_expand$;

ALTER TABLE job_queue ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE capture_requests ADD COLUMN IF NOT EXISTS origin_actor_kind text;
ALTER TABLE capture_requests ADD COLUMN IF NOT EXISTS origin_actor_id uuid;
ALTER TABLE rate_limit_windows ADD COLUMN IF NOT EXISTS environment text;
ALTER TABLE rate_limit_windows ADD COLUMN IF NOT EXISTS principal_kind text;
ALTER TABLE rate_limit_windows ADD COLUMN IF NOT EXISTS principal_id text;
ALTER TABLE rate_limit_windows ADD COLUMN IF NOT EXISTS operation text;

CREATE TABLE IF NOT EXISTS research_suggestion_sources (
  user_id uuid,
  research_suggestion_id text NOT NULL,
  item_id text NOT NULL,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (research_suggestion_id, position),
  CONSTRAINT research_suggestion_sources_position_check CHECK (position >= 0)
);
CREATE INDEX IF NOT EXISTS research_suggestion_sources_user_idx
  ON research_suggestion_sources(user_id);
CREATE INDEX IF NOT EXISTS research_suggestion_sources_item_idx
  ON research_suggestion_sources(user_id, item_id);
