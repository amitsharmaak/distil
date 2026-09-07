-- Phase 3 backfill. The dedicated migrator sets app.migration_user_id from its
-- required --amit-user-id argument for this transaction. No email or legacy
-- session value is allowed to choose the owner.

DO $phase3_backfill$
DECLARE
  approved_user_id uuid := nullif(current_setting('app.migration_user_id', true), '')::uuid;
  table_name text;
  wrong_owner_count bigint;
  source_orphan_count bigint;
BEGIN
  IF approved_user_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM items LIMIT 1)
      OR EXISTS (SELECT 1 FROM capture_requests LIMIT 1)
      OR EXISTS (SELECT 1 FROM job_queue LIMIT 1) THEN
      RAISE EXCEPTION 'app.migration_user_id must be set to the approved Amit UUID';
    END IF;
    RETURN;
  END IF;

  INSERT INTO users (id, status)
  VALUES (approved_user_id, 'migration_pending')
  ON CONFLICT (id) DO NOTHING;

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
    EXECUTE format('SELECT count(*) FROM %I WHERE user_id IS NOT NULL AND user_id <> $1', table_name)
      INTO wrong_owner_count USING approved_user_id;
    IF wrong_owner_count <> 0 THEN
      RAISE EXCEPTION '% contains % rows assigned to an owner other than the approved UUID',
        table_name, wrong_owner_count;
    END IF;
    EXECUTE format('UPDATE %I SET user_id = $1 WHERE user_id IS NULL', table_name)
      USING approved_user_id;
  END LOOP;

  UPDATE job_queue
  SET idempotency_key = coalesce(
    nullif(payload->>'idempotencyKey', ''),
    nullif(payload->>'idempotency_key', ''),
    id
  )
  WHERE idempotency_key IS NULL;

  UPDATE capture_requests
  SET origin_actor_kind = coalesce(origin_actor_kind, 'user'),
      origin_actor_id = coalesce(origin_actor_id, approved_user_id)
  WHERE origin_actor_kind IS NULL OR origin_actor_id IS NULL;

  UPDATE rate_limit_windows
  SET environment = coalesce(environment, 'legacy'),
      principal_kind = coalesce(principal_kind, 'user'),
      principal_id = coalesce(principal_id, approved_user_id::text),
      operation = coalesce(operation, key)
  WHERE environment IS NULL OR principal_kind IS NULL OR principal_id IS NULL OR operation IS NULL;

  SELECT count(*) INTO source_orphan_count
  FROM research_suggestions AS suggestion
  CROSS JOIN LATERAL jsonb_array_elements_text(suggestion.source_item_ids) AS source(item_id)
  LEFT JOIN items AS item
    ON item.user_id = suggestion.user_id AND item.id = source.item_id
  WHERE item.id IS NULL;
  IF source_orphan_count <> 0 THEN
    RAISE EXCEPTION 'research_suggestions contains % source item references without the same owner',
      source_orphan_count;
  END IF;

  INSERT INTO research_suggestion_sources (
    user_id, research_suggestion_id, item_id, position
  )
  SELECT suggestion.user_id, suggestion.id, source.item_id, source.position - 1
  FROM research_suggestions AS suggestion
  CROSS JOIN LATERAL jsonb_array_elements_text(suggestion.source_item_ids)
    WITH ORDINALITY AS source(item_id, position)
  ON CONFLICT (research_suggestion_id, position) DO UPDATE
    SET user_id = EXCLUDED.user_id, item_id = EXCLUDED.item_id;
END
$phase3_backfill$;

