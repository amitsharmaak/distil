CREATE TABLE workspace_records (
  id text PRIMARY KEY,
  workspace_id text NOT NULL
);

ALTER TABLE workspace_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_records_policy ON workspace_records
  USING (workspace_id = current_setting('app.workspace_id', true));
