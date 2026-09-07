-- Phase 3 contract. This file intentionally fails when any expanded ownership
-- column remains nullable. Apply only after the after-backfill verifier passes.

DO $phase3_roles_required$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'distil_runtime') THEN
    RAISE EXCEPTION 'distil_runtime role is required; apply phase3_roles.sql as database owner';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'distil_migration') THEN
    RAISE EXCEPTION 'distil_migration role is required; apply phase3_roles.sql as database owner';
  END IF;
END
$phase3_roles_required$;

DO $phase3_contract$
DECLARE
  table_name text;
  null_owner_count bigint;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'items','item_notes','annotations','collections','collection_items','item_events',
    'digest_runs','digest_items','personal_preferences','digest_jobs',
    'item_content_versions','content_chunks','intelligence_artifacts','intelligence_claims',
    'claim_evidence','knowledge_backfill_checkpoints','oauth_tokens','ai_summaries','feedback',
    'research_reports','research_suggestions','user_settings','notifications','item_embeddings',
    'audit_log','workflow_runs','agent_actions','approval_queue','chat_conversations',
    'chat_messages','job_queue','publisher_queue','raw_content','capture_requests',
    'capture_tokens','rate_limit_windows','research_suggestion_sources'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE user_id IS NULL', table_name)
      INTO null_owner_count;
    IF null_owner_count <> 0 THEN
      RAISE EXCEPTION '% still contains % rows without an owner', table_name, null_owner_count;
    END IF;
    EXECUTE format('ALTER TABLE %I ALTER COLUMN user_id SET NOT NULL', table_name);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN user_id SET DEFAULT distil_current_user_id()',
      table_name);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID',
      table_name, table_name || '_user_fk');
    EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I',
      table_name, table_name || '_user_fk');
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (user_id = nullif(current_setting(''app.user_id'', true), '''')::uuid) WITH CHECK (user_id = nullif(current_setting(''app.user_id'', true), '''')::uuid)',
      table_name || '_tenant_isolation', table_name);
  END LOOP;
END
$phase3_contract$;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_self_isolation ON users FOR ALL
  USING (id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.user_id', true), '')::uuid);

DO $phase3_identity_rls$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'auth_identities','session_metadata','account_exports',
    'account_deletions','usage_counters','user_entitlements'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN user_id SET DEFAULT distil_current_user_id()',
      table_name);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (user_id = nullif(current_setting(''app.user_id'', true), '''')::uuid) WITH CHECK (user_id = nullif(current_setting(''app.user_id'', true), '''')::uuid)',
      table_name || '_tenant_isolation', table_name);
  END LOOP;
END
$phase3_identity_rls$;

-- Parent-side composite identities used by same-owner foreign keys.
CREATE UNIQUE INDEX items_user_id_id_idx ON items(user_id, id);
CREATE UNIQUE INDEX collections_user_id_id_idx ON collections(user_id, id);
CREATE UNIQUE INDEX digest_runs_user_id_id_idx ON digest_runs(user_id, id);
CREATE UNIQUE INDEX item_content_versions_owner_id_idx
  ON item_content_versions(user_id, id);
CREATE UNIQUE INDEX item_content_versions_user_id_id_item_idx
  ON item_content_versions(user_id, id, item_id);
CREATE UNIQUE INDEX content_chunks_user_id_id_idx ON content_chunks(user_id, id);
CREATE UNIQUE INDEX intelligence_artifacts_user_id_id_idx
  ON intelligence_artifacts(user_id, id);
CREATE UNIQUE INDEX intelligence_claims_user_id_id_idx ON intelligence_claims(user_id, id);
CREATE UNIQUE INDEX research_reports_owner_id_idx ON research_reports(user_id, id);
CREATE UNIQUE INDEX research_suggestions_owner_id_idx ON research_suggestions(user_id, id);
CREATE UNIQUE INDEX workflow_runs_owner_id_idx ON workflow_runs(user_id, id);
CREATE UNIQUE INDEX chat_conversations_user_id_id_idx ON chat_conversations(user_id, id);

-- Same-owner graph constraints. Existing single-column foreign keys remain for
-- compatibility; these additional keys reject mixed-tenant graphs.
ALTER TABLE item_notes ADD CONSTRAINT item_notes_user_item_fk
  FOREIGN KEY (user_id, item_id) REFERENCES items(user_id, id) ON DELETE CASCADE;
ALTER TABLE annotations ADD CONSTRAINT annotations_user_item_fk
  FOREIGN KEY (user_id, item_id) REFERENCES items(user_id, id) ON DELETE CASCADE;
ALTER TABLE collection_items ADD CONSTRAINT collection_items_user_collection_fk
  FOREIGN KEY (user_id, collection_id) REFERENCES collections(user_id, id) ON DELETE CASCADE;
ALTER TABLE collection_items ADD CONSTRAINT collection_items_user_item_fk
  FOREIGN KEY (user_id, item_id) REFERENCES items(user_id, id) ON DELETE CASCADE;
ALTER TABLE item_events ADD CONSTRAINT item_events_user_item_fk
  FOREIGN KEY (user_id, item_id) REFERENCES items(user_id, id) ON DELETE CASCADE;
ALTER TABLE digest_items ADD CONSTRAINT digest_items_user_run_fk
  FOREIGN KEY (user_id, digest_run_id) REFERENCES digest_runs(user_id, id) ON DELETE CASCADE;
ALTER TABLE digest_items ADD CONSTRAINT digest_items_user_item_fk
  FOREIGN KEY (user_id, item_id) REFERENCES items(user_id, id) ON DELETE CASCADE;
ALTER TABLE item_content_versions ADD CONSTRAINT item_content_versions_user_item_fk
  FOREIGN KEY (user_id, item_id) REFERENCES items(user_id, id) ON DELETE CASCADE;
ALTER TABLE content_chunks ADD CONSTRAINT content_chunks_user_version_item_fk
  FOREIGN KEY (user_id, content_version_id, item_id)
  REFERENCES item_content_versions(user_id, id, item_id) ON DELETE CASCADE;
ALTER TABLE intelligence_artifacts ADD CONSTRAINT intelligence_artifacts_user_version_item_fk
  FOREIGN KEY (user_id, content_version_id, item_id)
  REFERENCES item_content_versions(user_id, id, item_id) ON DELETE CASCADE;
ALTER TABLE intelligence_artifacts ADD CONSTRAINT intelligence_artifacts_user_supersedes_fk
  FOREIGN KEY (user_id, supersedes_artifact_id)
  REFERENCES intelligence_artifacts(user_id, id);
ALTER TABLE intelligence_claims ADD CONSTRAINT intelligence_claims_user_artifact_fk
  FOREIGN KEY (user_id, artifact_id)
  REFERENCES intelligence_artifacts(user_id, id) ON DELETE CASCADE;
ALTER TABLE claim_evidence ADD CONSTRAINT claim_evidence_user_claim_fk
  FOREIGN KEY (user_id, claim_id) REFERENCES intelligence_claims(user_id, id) ON DELETE CASCADE;
ALTER TABLE claim_evidence ADD CONSTRAINT claim_evidence_user_chunk_fk
  FOREIGN KEY (user_id, chunk_id) REFERENCES content_chunks(user_id, id) ON DELETE CASCADE;
ALTER TABLE ai_summaries ADD CONSTRAINT ai_summaries_user_item_fk
  FOREIGN KEY (user_id, item_id) REFERENCES items(user_id, id) ON DELETE CASCADE;
ALTER TABLE feedback ADD CONSTRAINT feedback_user_item_fk
  FOREIGN KEY (user_id, item_id) REFERENCES items(user_id, id) ON DELETE CASCADE;
ALTER TABLE research_reports ADD CONSTRAINT research_reports_user_item_fk
  FOREIGN KEY (user_id, item_id) REFERENCES items(user_id, id);
ALTER TABLE research_suggestions ADD CONSTRAINT research_suggestions_user_report_fk
  FOREIGN KEY (user_id, research_report_id) REFERENCES research_reports(user_id, id);
ALTER TABLE research_suggestion_sources ADD CONSTRAINT research_sources_user_suggestion_fk
  FOREIGN KEY (user_id, research_suggestion_id)
  REFERENCES research_suggestions(user_id, id) ON DELETE CASCADE;
ALTER TABLE research_suggestion_sources ADD CONSTRAINT research_sources_user_item_fk
  FOREIGN KEY (user_id, item_id) REFERENCES items(user_id, id) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT notifications_user_item_fk
  FOREIGN KEY (user_id, item_id) REFERENCES items(user_id, id) ON DELETE CASCADE;
ALTER TABLE item_embeddings ADD CONSTRAINT item_embeddings_user_item_fk
  FOREIGN KEY (user_id, item_id) REFERENCES items(user_id, id) ON DELETE CASCADE;
ALTER TABLE workflow_runs ADD CONSTRAINT workflow_runs_user_item_fk
  FOREIGN KEY (user_id, item_id) REFERENCES items(user_id, id);
ALTER TABLE agent_actions ADD CONSTRAINT agent_actions_user_workflow_fk
  FOREIGN KEY (user_id, workflow_id) REFERENCES workflow_runs(user_id, id);
ALTER TABLE approval_queue ADD CONSTRAINT approval_queue_user_workflow_fk
  FOREIGN KEY (user_id, workflow_id) REFERENCES workflow_runs(user_id, id);
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_user_conversation_fk
  FOREIGN KEY (user_id, conversation_id)
  REFERENCES chat_conversations(user_id, id) ON DELETE CASCADE;
ALTER TABLE raw_content ADD CONSTRAINT raw_content_user_item_fk
  FOREIGN KEY (user_id, item_id) REFERENCES items(user_id, id);
ALTER TABLE capture_requests ADD CONSTRAINT capture_requests_user_item_fk
  FOREIGN KEY (user_id, item_id) REFERENCES items(user_id, id);

-- Replace global personal-data uniqueness with tenant-relative uniqueness.
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_normalized_url_key;
DROP INDEX IF EXISTS items_normalized_url_idx;
CREATE UNIQUE INDEX items_user_normalized_url_idx
  ON items(user_id, normalized_url) WHERE normalized_url IS NOT NULL;

ALTER TABLE item_events DROP CONSTRAINT IF EXISTS item_events_event_key_key;
CREATE UNIQUE INDEX item_events_user_event_key_idx ON item_events(user_id, event_key);

ALTER TABLE digest_runs DROP CONSTRAINT IF EXISTS digest_runs_digest_date_key;
ALTER TABLE digest_runs DROP CONSTRAINT IF EXISTS digest_runs_local_date_key;
CREATE UNIQUE INDEX digest_runs_user_digest_date_idx ON digest_runs(user_id, digest_date);
CREATE UNIQUE INDEX digest_runs_user_local_date_idx ON digest_runs(user_id, local_date);

ALTER TABLE digest_jobs DROP CONSTRAINT IF EXISTS digest_jobs_local_date_key;
ALTER TABLE digest_jobs DROP CONSTRAINT IF EXISTS digest_jobs_idempotency_key_key;
CREATE UNIQUE INDEX digest_jobs_user_local_date_idx ON digest_jobs(user_id, local_date);
CREATE UNIQUE INDEX digest_jobs_user_idempotency_idx ON digest_jobs(user_id, idempotency_key);

DROP INDEX IF EXISTS item_content_versions_item_version_idx;
DROP INDEX IF EXISTS item_content_versions_identity_idx;
CREATE UNIQUE INDEX item_content_versions_user_item_version_idx
  ON item_content_versions(user_id, item_id, version);
CREATE UNIQUE INDEX item_content_versions_user_identity_idx
  ON item_content_versions(user_id, item_id, content_hash, extractor_version);

DROP INDEX IF EXISTS content_chunks_version_ordinal_idx;
CREATE UNIQUE INDEX content_chunks_user_version_ordinal_idx
  ON content_chunks(user_id, content_version_id, ordinal);

DROP INDEX IF EXISTS intelligence_artifacts_item_type_version_idx;
DROP INDEX IF EXISTS intelligence_artifacts_current_idx;
CREATE UNIQUE INDEX intelligence_artifacts_user_item_type_version_idx
  ON intelligence_artifacts(user_id, item_id, artifact_type, version);
CREATE UNIQUE INDEX intelligence_artifacts_user_current_idx
  ON intelligence_artifacts(user_id, item_id, artifact_type) WHERE is_current = true;

DROP INDEX IF EXISTS intelligence_claims_artifact_ordinal_idx;
CREATE UNIQUE INDEX intelligence_claims_user_artifact_ordinal_idx
  ON intelligence_claims(user_id, artifact_id, ordinal);

ALTER TABLE oauth_tokens DROP CONSTRAINT IF EXISTS oauth_tokens_pkey;
ALTER TABLE oauth_tokens ADD CONSTRAINT oauth_tokens_pkey
  PRIMARY KEY (user_id, provider, team_id);

DROP INDEX IF EXISTS ai_summaries_item_prompt_idx;
CREATE UNIQUE INDEX ai_summaries_user_item_prompt_idx
  ON ai_summaries(user_id, item_id, prompt_type);

ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_pkey;
ALTER TABLE user_settings ADD CONSTRAINT user_settings_pkey PRIMARY KEY (user_id, key);

ALTER TABLE personal_preferences DROP CONSTRAINT IF EXISTS personal_preferences_pkey;
ALTER TABLE personal_preferences ADD CONSTRAINT personal_preferences_pkey PRIMARY KEY (user_id, id);

ALTER TABLE knowledge_backfill_checkpoints
  DROP CONSTRAINT IF EXISTS knowledge_backfill_checkpoints_pkey;
ALTER TABLE knowledge_backfill_checkpoints ADD CONSTRAINT knowledge_backfill_checkpoints_pkey
  PRIMARY KEY (user_id, job_key);

ALTER TABLE item_embeddings DROP CONSTRAINT IF EXISTS item_embeddings_pkey;
ALTER TABLE item_embeddings ADD CONSTRAINT item_embeddings_pkey PRIMARY KEY (user_id, item_id);

DROP INDEX IF EXISTS capture_active_url_idx;
CREATE UNIQUE INDEX capture_user_active_url_idx
  ON capture_requests(user_id, normalized_url)
  WHERE status IN ('queued','processing','ready');

ALTER TABLE publisher_queue DROP CONSTRAINT IF EXISTS publisher_queue_pkey;
ALTER TABLE publisher_queue ADD CONSTRAINT publisher_queue_pkey
  PRIMARY KEY (user_id, publisher_id, url);

ALTER TABLE rate_limit_windows DROP CONSTRAINT IF EXISTS rate_limit_windows_pkey;
ALTER TABLE rate_limit_windows
  ALTER COLUMN environment SET NOT NULL,
  ALTER COLUMN principal_kind SET NOT NULL,
  ALTER COLUMN principal_id SET NOT NULL,
  ALTER COLUMN operation SET NOT NULL;
ALTER TABLE rate_limit_windows ADD CONSTRAINT rate_limit_windows_pkey
  PRIMARY KEY (user_id, environment, principal_kind, principal_id, operation,
    window_start, window_seconds);

ALTER TABLE research_suggestion_sources
  DROP CONSTRAINT IF EXISTS research_suggestion_sources_pkey;
ALTER TABLE research_suggestion_sources ADD CONSTRAINT research_suggestion_sources_pkey
  PRIMARY KEY (user_id, research_suggestion_id, position);

ALTER TABLE job_queue ALTER COLUMN idempotency_key SET NOT NULL;
CREATE UNIQUE INDEX job_queue_user_idempotency_idx
  ON job_queue(user_id, idempotency_key);
ALTER TABLE capture_requests
  ALTER COLUMN origin_actor_kind SET NOT NULL,
  ALTER COLUMN origin_actor_id SET NOT NULL;

-- Normalized links become the only contractual source graph. The legacy JSON
-- column remains as an empty compatibility field for older readers during the
-- application rollout, but cannot store identifiers after contract.
UPDATE research_suggestions SET source_item_ids = '[]'::jsonb;
ALTER TABLE research_suggestions ADD CONSTRAINT research_suggestions_legacy_sources_empty_check
  CHECK (source_item_ids = '[]'::jsonb);

GRANT EXECUTE ON FUNCTION distil_current_user_id() TO distil_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO distil_runtime;
REVOKE ALL ON invitations, distil_tenant_migrations FROM distil_runtime;
DO $phase3_optional_ledger$
BEGIN
  IF to_regclass('public.distil_migrations') IS NOT NULL THEN
    REVOKE ALL ON distil_migrations FROM distil_runtime;
  END IF;
END
$phase3_optional_ledger$;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM distil_runtime;
