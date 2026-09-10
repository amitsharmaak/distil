-- Phase 3 returning-user authentication: exact-email lookup for invite-only magic-link login.
-- Apply only after lifecycle through `db:tenant:migrate -- --stage returning-auth`.

ALTER TABLE distil_tenant_migrations
  DROP CONSTRAINT IF EXISTS distil_tenant_migrations_stage_check;
ALTER TABLE distil_tenant_migrations
  ADD CONSTRAINT distil_tenant_migrations_stage_check
  CHECK (stage IN ('expand','backfill','contract','lifecycle','returning-auth'));

CREATE INDEX IF NOT EXISTS users_primary_email_status_idx
  ON users(primary_email, status)
  WHERE primary_email IS NOT NULL;

CREATE OR REPLACE FUNCTION distil_resolve_active_auth_email(requested_email text)
RETURNS TABLE (user_id uuid, primary_email text, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $phase3_resolve_active_auth_email$
  SELECT account.id, account.primary_email, account.status
  FROM public.users AS account
  WHERE account.primary_email = requested_email
    AND account.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.auth_identities AS identity
      WHERE identity.user_id = account.id
        AND identity.provider = 'neon'
    )
  ORDER BY account.created_at
  LIMIT 1
$phase3_resolve_active_auth_email$;

ALTER FUNCTION distil_resolve_active_auth_email(text) OWNER TO distil_migration;
REVOKE ALL ON FUNCTION distil_resolve_active_auth_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION distil_resolve_active_auth_email(text) TO distil_runtime;
