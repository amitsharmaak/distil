-- Apply after browser-connections, before deploying code that names shortcut_pairings.
ALTER TABLE distil_tenant_migrations
  DROP CONSTRAINT IF EXISTS distil_tenant_migrations_stage_check;
ALTER TABLE distil_tenant_migrations
  ADD CONSTRAINT distil_tenant_migrations_stage_check
  CHECK (stage IN ('expand','backfill','contract','lifecycle','returning-auth','perf-indexes','summary-structure','feed-search','life-areas','drop-collections','browser-connections','phone-pairing'));

ALTER TABLE capture_tokens DROP CONSTRAINT IF EXISTS capture_tokens_kind_check;
ALTER TABLE capture_tokens ADD CONSTRAINT capture_tokens_kind_check
  CHECK (kind IN ('manual','browser','phone'));

-- The same-owner token reference needs a composite parent key.
CREATE UNIQUE INDEX IF NOT EXISTS capture_tokens_user_id_id_idx ON capture_tokens(user_id, id);

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


-- Anonymous wrong guesses have no tenant yet. Store only a hashed IP limiter key,
-- and expose one bounded operation rather than granting runtime table access.
CREATE TABLE IF NOT EXISTS shortcut_pairing_rate_limits (
  key_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL,
  PRIMARY KEY (key_hash, window_start),
  CONSTRAINT shortcut_pairing_rate_limits_key_check CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT shortcut_pairing_rate_limits_attempts_check CHECK (attempts BETWEEN 1 AND 11)
);
CREATE INDEX IF NOT EXISTS shortcut_pairing_rate_limits_expiry_idx
  ON shortcut_pairing_rate_limits(window_start);
GRANT SELECT, INSERT, UPDATE, DELETE ON shortcut_pairing_rate_limits TO distil_migration;
REVOKE ALL ON shortcut_pairing_rate_limits FROM PUBLIC, distil_runtime;

CREATE OR REPLACE FUNCTION distil_consume_shortcut_pairing_rate_limit(key_hash text)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $consume_shortcut_pairing_rate_limit$
DECLARE
  bucket timestamptz := date_bin(interval '15 minutes', clock_timestamp(), timestamptz '2000-01-01 00:00:00+00');
  attempt_count integer;
BEGIN
  IF key_hash IS NULL OR key_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;
  DELETE FROM public.shortcut_pairing_rate_limits AS expired
  USING (
    SELECT old.key_hash, old.window_start
    FROM public.shortcut_pairing_rate_limits AS old
    WHERE old.window_start < bucket
    ORDER BY old.window_start
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  ) AS stale
  WHERE expired.key_hash = stale.key_hash AND expired.window_start = stale.window_start;

  INSERT INTO public.shortcut_pairing_rate_limits AS limits (key_hash, window_start, attempts)
  VALUES (distil_consume_shortcut_pairing_rate_limit.key_hash, bucket, 1)
  ON CONFLICT ON CONSTRAINT shortcut_pairing_rate_limits_pkey DO UPDATE
    SET attempts = least(limits.attempts + 1, 11)
  RETURNING attempts INTO attempt_count;
  RETURN attempt_count <= 10;
END
$consume_shortcut_pairing_rate_limit$;
ALTER FUNCTION distil_consume_shortcut_pairing_rate_limit(text) OWNER TO distil_migration;
REVOKE ALL ON FUNCTION distil_consume_shortcut_pairing_rate_limit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION distil_consume_shortcut_pairing_rate_limit(text) TO distil_runtime;
