CREATE TABLE items (
  id text PRIMARY KEY, title text NOT NULL, summary text NOT NULL DEFAULT '', full_content text,
  source_type text NOT NULL, content_type text NOT NULL DEFAULT 'article', topics jsonb NOT NULL DEFAULT '[]',
  author text, publication text, url text NOT NULL, normalized_url text UNIQUE,
  priority text NOT NULL DEFAULT 'medium', is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL, duration text, thumbnail_url text, ai_priority_score double precision,
  extracted_links jsonb, content_extracted_at timestamptz, processing_status text NOT NULL DEFAULT 'ready',
  rejection_reason text, content_classification jsonb, detected_media jsonb, information_density double precision,
  search_vector tsvector GENERATED ALWAYS AS
    (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '')) ||
     jsonb_to_tsvector('english', topics, '["string"]')) STORED,
  CONSTRAINT items_priority_check CHECK (priority IN ('high','medium','low')),
  CONSTRAINT items_processing_check CHECK (processing_status IN ('processing','ready','rejected')),
  CONSTRAINT items_topics_array_check CHECK (jsonb_typeof(topics) = 'array')
);
CREATE INDEX items_created_idx ON items(created_at DESC);
CREATE INDEX items_priority_idx ON items(priority);
CREATE INDEX items_source_idx ON items(source_type);
CREATE INDEX items_is_read_idx ON items(is_read);
CREATE INDEX items_search_idx ON items USING gin(search_vector);

CREATE TABLE oauth_tokens (
  provider text NOT NULL, team_id text NOT NULL DEFAULT '', access_token text NOT NULL,
  refresh_token text, expiry_date bigint, email text, updated_at timestamptz NOT NULL,
  PRIMARY KEY (provider, team_id)
);
CREATE TABLE ai_summaries (
  id text PRIMARY KEY, item_id text NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  summary text NOT NULL, model text NOT NULL, prompt_type text NOT NULL, created_at timestamptz NOT NULL,
  UNIQUE(item_id, prompt_type)
);
CREATE INDEX ai_summaries_item_idx ON ai_summaries(item_id);
CREATE TABLE feedback (
  id text PRIMARY KEY, item_id text NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  rating integer NOT NULL, reason text, created_at timestamptz NOT NULL,
  CONSTRAINT feedback_rating_check CHECK (rating IN (-1, 1))
);
CREATE INDEX feedback_item_idx ON feedback(item_id);
CREATE INDEX feedback_created_idx ON feedback(created_at DESC);
CREATE TABLE research_reports (
  id text PRIMARY KEY, item_id text REFERENCES items(id) ON DELETE SET NULL,
  query text NOT NULL, report text NOT NULL DEFAULT '',
  sources text NOT NULL DEFAULT '[]', model text NOT NULL, status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL, completed_at timestamptz, progress text
);
CREATE INDEX research_reports_item_idx ON research_reports(item_id);
CREATE TABLE research_suggestions (
  id text PRIMARY KEY, topic_key text NOT NULL, topic text NOT NULL, reason text NOT NULL DEFAULT '',
  suggested_query text NOT NULL, source_item_ids jsonb NOT NULL DEFAULT '[]', status text NOT NULL DEFAULT 'pending',
  research_report_id text REFERENCES research_reports(id) ON DELETE SET NULL, created_at timestamptz NOT NULL,
  CONSTRAINT research_source_items_array_check CHECK (jsonb_typeof(source_item_ids) = 'array')
);
CREATE INDEX research_suggestions_status_idx ON research_suggestions(status);
CREATE TABLE user_settings (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL);
CREATE TABLE notifications (
  id text PRIMARY KEY, item_id text NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  title text NOT NULL, message text NOT NULL DEFAULT '', is_read boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL
);
CREATE INDEX notifications_created_idx ON notifications(created_at DESC);
CREATE TABLE item_embeddings (
  item_id text PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  embedding jsonb NOT NULL, model text NOT NULL, created_at timestamptz NOT NULL,
  CONSTRAINT item_embeddings_array_check CHECK (jsonb_typeof(embedding) = 'array')
);
CREATE TABLE audit_log (
  id text PRIMARY KEY, action text NOT NULL, tool_name text, input_hash text, output_hash text, model text,
  provider text, tokens_in integer, tokens_out integer, cost double precision, latency_ms integer, trace_id text,
  created_at timestamptz NOT NULL
);
CREATE INDEX audit_log_created_idx ON audit_log(created_at DESC);
CREATE INDEX audit_log_trace_idx ON audit_log(trace_id);
CREATE TABLE workflow_runs (
  id text PRIMARY KEY, workflow_type text NOT NULL, item_id text REFERENCES items(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending', current_step text, steps_json jsonb NOT NULL DEFAULT '[]', error text,
  trace_id text, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, completed_at timestamptz,
  CONSTRAINT workflow_steps_array_check CHECK (jsonb_typeof(steps_json) = 'array')
);
CREATE INDEX workflow_runs_status_idx ON workflow_runs(status);
CREATE INDEX workflow_runs_item_idx ON workflow_runs(item_id);
CREATE INDEX workflow_runs_created_idx ON workflow_runs(created_at DESC);
CREATE TABLE agent_actions (
  id text PRIMARY KEY, workflow_id text REFERENCES workflow_runs(id) ON DELETE SET NULL, action_type text NOT NULL,
  tool_name text, input text, output text, reasoning text, status text NOT NULL DEFAULT 'completed', trace_id text,
  created_at timestamptz NOT NULL
);
CREATE INDEX agent_actions_workflow_idx ON agent_actions(workflow_id);
CREATE INDEX agent_actions_created_idx ON agent_actions(created_at DESC);
CREATE TABLE approval_queue (
  id text PRIMARY KEY, workflow_id text REFERENCES workflow_runs(id) ON DELETE SET NULL, action_type text NOT NULL,
  description text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'pending',
  decided_at timestamptz, decided_by text, trace_id text, created_at timestamptz NOT NULL,
  CONSTRAINT approval_payload_object_check CHECK (jsonb_typeof(payload) = 'object')
);
CREATE INDEX approval_queue_status_idx ON approval_queue(status);
CREATE INDEX approval_queue_created_idx ON approval_queue(created_at DESC);
CREATE TABLE chat_conversations (
  id text PRIMARY KEY, title text, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE chat_messages (
  id text PRIMARY KEY, conversation_id text NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role text NOT NULL, content text NOT NULL, citations jsonb, tool_calls jsonb, created_at timestamptz NOT NULL
);
CREATE INDEX chat_messages_conversation_idx ON chat_messages(conversation_id, created_at);
CREATE TABLE job_queue (
  id text PRIMARY KEY, job_type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'pending',
  priority integer NOT NULL DEFAULT 0, max_retries integer NOT NULL DEFAULT 3, attempts integer NOT NULL DEFAULT 0,
  last_error text, locked_at timestamptz, locked_by text, run_after timestamptz, created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL, completed_at timestamptz,
  CONSTRAINT job_payload_object_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT job_attempts_check CHECK (attempts >= 0 AND max_retries >= 0)
);
CREATE INDEX job_queue_status_idx ON job_queue(status, priority DESC, created_at);
CREATE INDEX job_queue_type_idx ON job_queue(job_type);
CREATE TABLE publisher_queue (
  publisher_id text NOT NULL, url text NOT NULL, discovered_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0, last_error text,
  PRIMARY KEY (publisher_id, url)
);
CREATE INDEX publisher_queue_status_idx ON publisher_queue(publisher_id, status);
CREATE TABLE raw_content (
  id text PRIMARY KEY, item_id text REFERENCES items(id) ON DELETE SET NULL, source_type text NOT NULL,
  raw_body text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', fetched_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT raw_content_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX raw_content_item_idx ON raw_content(item_id);

CREATE TABLE capture_requests (
  id text PRIMARY KEY, url text NOT NULL, normalized_url text NOT NULL, title text, notes text,
  topics jsonb NOT NULL DEFAULT '[]', priority text NOT NULL DEFAULT 'medium', source text NOT NULL,
  status text NOT NULL DEFAULT 'queued', item_id text REFERENCES items(id) ON DELETE SET NULL,
  retryable boolean NOT NULL DEFAULT false, attempts integer NOT NULL DEFAULT 0,
  last_error_code text, last_error_message text, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  CONSTRAINT capture_priority_check CHECK (priority IN ('high','medium','low')),
  CONSTRAINT capture_source_check CHECK (source IN ('web','ios-shortcut','browser-extension')),
  CONSTRAINT capture_status_check CHECK (status IN ('queued','processing','ready','rejected','failed')),
  CONSTRAINT capture_attempts_check CHECK (attempts >= 0),
  CONSTRAINT capture_topics_array_check CHECK (jsonb_typeof(topics) = 'array')
);
CREATE UNIQUE INDEX capture_active_url_idx ON capture_requests(normalized_url)
  WHERE status IN ('queued','processing','ready');
CREATE INDEX capture_created_idx ON capture_requests(created_at DESC);
CREATE TABLE capture_tokens (
  id text PRIMARY KEY, name text NOT NULL, token_hash text NOT NULL UNIQUE, token_prefix text NOT NULL,
  created_at timestamptz NOT NULL, last_used_at timestamptz, revoked_at timestamptz
);
CREATE INDEX capture_tokens_active_hash_idx ON capture_tokens(token_hash) WHERE revoked_at IS NULL;
CREATE TABLE rate_limit_windows (
  key text NOT NULL, window_start timestamptz NOT NULL, window_seconds integer NOT NULL,
  count integer NOT NULL DEFAULT 0, PRIMARY KEY (key, window_start, window_seconds),
  CONSTRAINT rate_limit_window_seconds_check CHECK (window_seconds > 0),
  CONSTRAINT rate_limit_count_check CHECK (count >= 0)
);
CREATE INDEX rate_limit_expiry_idx ON rate_limit_windows(window_start);
