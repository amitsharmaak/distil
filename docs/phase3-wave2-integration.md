# Phase 3 Wave 2 integration contract

This wave deliberately does not enable Gmail, Slack, or publisher connectors.
Their HTTP routes authenticate through the tenant boundary and then return a
uniform `404` until the following per-user implementation is integrated.

## Required shared schema addition

Add a tenant-owned `connector_oauth_states` table. The callback must consume a
nonce atomically, rather than reading and then deleting it in separate calls.

```sql
CREATE TABLE connector_oauth_states (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nonce uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('gmail', 'slack')),
  session_id uuid NULL,
  return_path text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, nonce),
  UNIQUE (nonce)
);
ALTER TABLE connector_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_oauth_states FORCE ROW LEVEL SECURITY;
CREATE POLICY connector_oauth_states_tenant_isolation ON connector_oauth_states
  FOR ALL USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
```

Implement the `ConnectorOAuthStateRepository` port in
`src/lib/connectors/oauth-state.ts` with one statement equivalent to:

```sql
DELETE FROM connector_oauth_states
WHERE nonce = $1 AND provider = $2 AND expires_at > now()
RETURNING user_id, nonce, provider, session_id, return_path, expires_at;
```

The connector enablement change must then: issue state using the locked
`AuthContext`; include it in the provider authorization request; consume it
before exchanging any provider code; verify `user_id` and `session_id`; use
`getTenantRepositories(context)` for OAuth token/settings/queue access; and
pass the context to every connector worker. Do not re-enable the legacy global
connector functions or publisher browser session directory.
