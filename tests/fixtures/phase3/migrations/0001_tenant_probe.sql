CREATE TABLE users (
  id uuid PRIMARY KEY
);

CREATE TABLE tenant_records (
  id text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value text NOT NULL,
  PRIMARY KEY (user_id, id)
);

ALTER TABLE tenant_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_records FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_records_isolation ON tenant_records
  FOR ALL
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
