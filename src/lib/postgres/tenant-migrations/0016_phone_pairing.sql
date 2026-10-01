-- Apply after browser-connections, before deploying code that names shortcut_pairings.
ALTER TABLE distil_tenant_migrations
  DROP CONSTRAINT IF EXISTS distil_tenant_migrations_stage_check;
ALTER TABLE distil_tenant_migrations
  ADD CONSTRAINT distil_tenant_migrations_stage_check
  CHECK (stage IN ('expand','backfill','contract','lifecycle','returning-auth','perf-indexes','summary-structure','feed-search','life-areas','drop-collections','browser-connections','phone-pairing'));

ALTER TABLE capture_tokens DROP CONSTRAINT IF EXISTS capture_tokens_kind_check;
ALTER TABLE capture_tokens ADD CONSTRAINT capture_tokens_kind_check
  CHECK (kind IN ('manual','browser','phone'));

CREATE TABLE IF NOT EXISTS shortcut_pairings (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id text NOT NULL,
  code_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  token_id text,
  PRIMARY KEY (user_id, id),
  CONSTRAINT shortcut_pairings_attempts_check CHECK (attempts BETWEEN 0 AND 5),
  CONSTRAINT shortcut_pairings_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT shortcut_pairings_token_fk FOREIGN KEY (user_id, token_id)
    REFERENCES capture_tokens(user_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS shortcut_pairings_pending_user_idx
  ON shortcut_pairings(user_id) WHERE consumed_at IS NULL;

ALTER TABLE shortcut_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shortcut_pairings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shortcut_pairings_tenant_isolation ON shortcut_pairings;
CREATE POLICY shortcut_pairings_tenant_isolation ON shortcut_pairings FOR ALL
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON shortcut_pairings TO distil_migration;
REVOKE ALL ON shortcut_pairings FROM PUBLIC, distil_runtime;
CREATE OR REPLACE VIEW tenant_api.shortcut_pairings WITH (security_barrier=true) AS
  SELECT * FROM public.shortcut_pairings
  WHERE user_id = nullif(current_setting('app.user_id', true), '')::uuid
  WITH CASCADED CHECK OPTION;
ALTER VIEW tenant_api.shortcut_pairings OWNER TO distil_migration;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_api.shortcut_pairings TO distil_runtime;

-- This exact-key function is the sole pre-context pairing identity lookup.
CREATE OR REPLACE FUNCTION distil_resolve_shortcut_pairing(requested_code_hash text)
RETURNS TABLE (pairing_id text, user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $resolve_shortcut_pairing$
  SELECT pairing.id, pairing.user_id
  FROM public.shortcut_pairings AS pairing
  JOIN public.users AS account ON account.id = pairing.user_id
  WHERE pairing.code_hash = requested_code_hash
    AND pairing.consumed_at IS NULL
    AND pairing.expires_at > now()
    AND pairing.attempts < 5
    AND account.status = 'active'
  LIMIT 1
$resolve_shortcut_pairing$;
ALTER FUNCTION distil_resolve_shortcut_pairing(text) OWNER TO distil_migration;
REVOKE ALL ON FUNCTION distil_resolve_shortcut_pairing(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION distil_resolve_shortcut_pairing(text) TO distil_runtime;
