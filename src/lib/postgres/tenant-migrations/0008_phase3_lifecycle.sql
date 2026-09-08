-- Phase 3 account lifecycle: additive schema, tenant views, and runtime grants.
-- Apply only after the contract stage through `db:tenant:migrate -- --stage lifecycle`.

ALTER TABLE distil_tenant_migrations
  DROP CONSTRAINT IF EXISTS distil_tenant_migrations_stage_check;
ALTER TABLE distil_tenant_migrations
  ADD CONSTRAINT distil_tenant_migrations_stage_check
  CHECK (stage IN ('expand','backfill','contract','lifecycle'));

ALTER TABLE account_exports ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE account_exports ADD COLUMN IF NOT EXISTS manifest_version integer NOT NULL DEFAULT 1;
ALTER TABLE account_exports ADD COLUMN IF NOT EXISTS size_bytes bigint;
ALTER TABLE account_exports ADD COLUMN IF NOT EXISTS failure_code text;
ALTER TABLE account_exports ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
UPDATE account_exports SET idempotency_key = id::text WHERE idempotency_key IS NULL;
ALTER TABLE account_exports ALTER COLUMN idempotency_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS account_exports_user_idempotency_idx
  ON account_exports(user_id, idempotency_key);

ALTER TABLE account_deletions ADD COLUMN IF NOT EXISTS failure_code text;
ALTER TABLE account_deletions ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE account_deletions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE job_queue ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz;
ALTER TABLE job_queue ADD COLUMN IF NOT EXISTS cancellation_reason text;

ALTER TABLE invitations ADD COLUMN IF NOT EXISTS dispatch_claim_id uuid;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS dispatch_claimed_at timestamptz;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS dispatch_claim_expires_at timestamptz;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS dispatch_retry_after timestamptz;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS dispatch_succeeded_at timestamptz;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS dispatch_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_dispatch_attempts_check;
ALTER TABLE invitations ADD CONSTRAINT invitations_dispatch_attempts_check
  CHECK (dispatch_attempts >= 0);
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_dispatch_claim_check;
ALTER TABLE invitations ADD CONSTRAINT invitations_dispatch_claim_check CHECK (
  (dispatch_claim_id IS NULL AND dispatch_claimed_at IS NULL AND dispatch_claim_expires_at IS NULL)
  OR
  (dispatch_claim_id IS NOT NULL AND dispatch_claimed_at IS NOT NULL
    AND dispatch_claim_expires_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS invitations_dispatch_retry_idx
  ON invitations(status, dispatch_retry_after);

-- PostgreSQL expands SELECT * when a view is created. Rebuild the contract views
-- for altered tables so the new additive columns are visible to tenant repositories.
DO $phase3_lifecycle_views$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['account_exports','account_deletions','job_queue'] LOOP
    EXECUTE format(
      'CREATE OR REPLACE VIEW tenant_api.%I WITH (security_barrier=true) AS SELECT * FROM public.%I WHERE user_id = nullif(current_setting(''app.user_id'', true), '''')::uuid WITH CASCADED CHECK OPTION',
      table_name, table_name);
    EXECUTE format('ALTER VIEW tenant_api.%I OWNER TO distil_migration', table_name);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_api.%I TO distil_runtime', table_name);
  END LOOP;
END
$phase3_lifecycle_views$;

CREATE TABLE IF NOT EXISTS user_quotas (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quota_key text NOT NULL,
  period text NOT NULL,
  hard_limit bigint NOT NULL,
  updated_by_actor_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, quota_key),
  CONSTRAINT user_quotas_period_check CHECK (period IN ('day','month')),
  CONSTRAINT user_quotas_limit_check CHECK (hard_limit >= 0)
);

CREATE TABLE IF NOT EXISTS connector_oauth_states (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nonce uuid NOT NULL,
  provider text NOT NULL,
  session_id uuid,
  return_path text NOT NULL,
  pkce_verifier_hash text NOT NULL,
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, nonce),
  UNIQUE (nonce),
  CONSTRAINT connector_oauth_states_provider_check CHECK (provider IN ('gmail','slack'))
);

CREATE TABLE IF NOT EXISTS account_deletion_tombstones (
  deletion_id uuid PRIMARY KEY,
  completed_at timestamptz NOT NULL,
  verifier_version integer NOT NULL DEFAULT 1,
  zero_row_count integer NOT NULL,
  zero_object_count integer NOT NULL,
  auth_purged boolean NOT NULL,
  verification_hash text NOT NULL,
  CONSTRAINT account_deletion_tombstones_zero_check
    CHECK (zero_row_count = 0 AND zero_object_count = 0 AND auth_purged)
);

CREATE TABLE IF NOT EXISTS operator_audit_events (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  target_user_hash text NOT NULL,
  reason text NOT NULL,
  request_id uuid NOT NULL,
  outcome text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operator_audit_metadata_check CHECK (jsonb_typeof(metadata) = 'object')
);

ALTER TABLE user_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_quotas FORCE ROW LEVEL SECURITY;
CREATE POLICY user_quotas_tenant_isolation ON user_quotas FOR ALL
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

ALTER TABLE connector_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_oauth_states FORCE ROW LEVEL SECURITY;
CREATE POLICY connector_oauth_states_tenant_isolation ON connector_oauth_states FOR ALL
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

CREATE OR REPLACE VIEW tenant_api.user_quotas WITH (security_barrier=true) AS
  SELECT * FROM public.user_quotas
  WHERE user_id = nullif(current_setting('app.user_id', true), '')::uuid
  WITH CASCADED CHECK OPTION;
ALTER VIEW tenant_api.user_quotas OWNER TO distil_migration;
GRANT SELECT ON tenant_api.user_quotas TO distil_runtime;

CREATE OR REPLACE VIEW tenant_api.connector_oauth_states WITH (security_barrier=true) AS
  SELECT * FROM public.connector_oauth_states
  WHERE user_id = nullif(current_setting('app.user_id', true), '')::uuid
  WITH CASCADED CHECK OPTION;
ALTER VIEW tenant_api.connector_oauth_states OWNER TO distil_migration;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_api.connector_oauth_states TO distil_runtime;

-- A deleted or suspended owner invalidates every capture credential immediately.
CREATE OR REPLACE FUNCTION distil_resolve_capture_token(requested_token_hash text)
RETURNS TABLE (token_id text, user_id uuid, revoked_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $phase3_resolve_capture_token$
  SELECT token.id, token.user_id, token.revoked_at
  FROM public.capture_tokens AS token
  JOIN public.users AS account ON account.id = token.user_id
  WHERE token.token_hash = requested_token_hash
    AND token.revoked_at IS NULL
    AND account.status = 'active'
  LIMIT 1
$phase3_resolve_capture_token$;
ALTER FUNCTION distil_resolve_capture_token(text) OWNER TO distil_migration;
REVOKE ALL ON FUNCTION distil_resolve_capture_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION distil_resolve_capture_token(text) TO distil_runtime;

REVOKE ALL ON account_deletion_tombstones, operator_audit_events FROM PUBLIC, distil_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  account_deletion_tombstones, operator_audit_events, user_quotas, connector_oauth_states
  TO distil_migration;

-- Only one requester may cross the provider side-effect boundary for an
-- invitation at a time. A crashed claim self-releases after two minutes.
CREATE OR REPLACE FUNCTION distil_claim_invitation_dispatch(
  requested_id uuid,
  requested_token_hash text,
  requested_email_hash text,
  requested_claim_id uuid
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $phase3_claim_invitation_dispatch$
  WITH claimed AS (
    UPDATE public.invitations
    SET dispatch_claim_id = requested_claim_id,
        dispatch_claimed_at = statement_timestamp(),
        dispatch_claim_expires_at = statement_timestamp() + interval '2 minutes',
        dispatch_attempts = dispatch_attempts + 1
    WHERE id = requested_id
      AND token_hash = requested_token_hash
      AND email_hash = requested_email_hash
      AND status = 'pending'
      AND revoked_at IS NULL
      AND consumed_at IS NULL
      AND expires_at > statement_timestamp()
      AND (dispatch_claim_expires_at IS NULL OR dispatch_claim_expires_at <= statement_timestamp())
      AND (dispatch_retry_after IS NULL OR dispatch_retry_after <= statement_timestamp())
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM claimed)
$phase3_claim_invitation_dispatch$;

CREATE OR REPLACE FUNCTION distil_complete_invitation_dispatch(
  requested_id uuid,
  requested_claim_id uuid
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $phase3_complete_invitation_dispatch$
  WITH completed AS (
    UPDATE public.invitations
    SET dispatch_claim_id = NULL,
        dispatch_claimed_at = NULL,
        dispatch_claim_expires_at = NULL,
        dispatch_retry_after = statement_timestamp() + interval '1 minute',
        dispatch_succeeded_at = statement_timestamp()
    WHERE id = requested_id
      AND dispatch_claim_id = requested_claim_id
      AND status = 'pending'
      AND revoked_at IS NULL
      AND consumed_at IS NULL
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM completed)
$phase3_complete_invitation_dispatch$;

CREATE OR REPLACE FUNCTION distil_fail_invitation_dispatch(
  requested_id uuid,
  requested_claim_id uuid
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $phase3_fail_invitation_dispatch$
  WITH failed AS (
    UPDATE public.invitations
    SET dispatch_claim_id = NULL,
        dispatch_claimed_at = NULL,
        dispatch_claim_expires_at = NULL,
        dispatch_retry_after = statement_timestamp() + make_interval(
          secs => least(
            300,
            (5 * power(2, least(greatest(dispatch_attempts - 1, 0), 6)))::integer
          )
        )
    WHERE id = requested_id
      AND dispatch_claim_id = requested_claim_id
      AND status = 'pending'
      AND revoked_at IS NULL
      AND consumed_at IS NULL
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM failed)
$phase3_fail_invitation_dispatch$;

ALTER FUNCTION distil_claim_invitation_dispatch(uuid, text, text, uuid)
  OWNER TO distil_migration;
ALTER FUNCTION distil_complete_invitation_dispatch(uuid, uuid)
  OWNER TO distil_migration;
ALTER FUNCTION distil_fail_invitation_dispatch(uuid, uuid)
  OWNER TO distil_migration;
REVOKE ALL ON FUNCTION distil_claim_invitation_dispatch(uuid, text, text, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION distil_complete_invitation_dispatch(uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION distil_fail_invitation_dispatch(uuid, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION distil_claim_invitation_dispatch(uuid, text, text, uuid)
  TO distil_runtime;
GRANT EXECUTE ON FUNCTION distil_complete_invitation_dispatch(uuid, uuid)
  TO distil_runtime;
GRANT EXECUTE ON FUNCTION distil_fail_invitation_dispatch(uuid, uuid)
  TO distil_runtime;
