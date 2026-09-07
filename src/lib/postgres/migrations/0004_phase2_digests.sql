-- Phase 2 in-app digests are PostgreSQL-only and remain single-user until Phase 3.
CREATE TABLE personal_preferences (
  id text PRIMARY KEY DEFAULT 'default',
  digest_enabled boolean NOT NULL DEFAULT false,
  digest_timezone text NOT NULL DEFAULT 'UTC',
  personalization_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_preferences_singleton_check CHECK (id = 'default'),
  CONSTRAINT personal_preferences_timezone_check CHECK (length(trim(digest_timezone)) BETWEEN 1 AND 100)
);

INSERT INTO personal_preferences(id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

ALTER TABLE digest_runs
  ADD COLUMN local_date date,
  ADD COLUMN timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN selection_version text NOT NULL DEFAULT 'deterministic-v1',
  ADD COLUMN content_mode text NOT NULL DEFAULT 'deterministic',
  ADD COLUMN selection_metadata jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN title_text text NOT NULL DEFAULT '',
  ADD COLUMN summary_text text NOT NULL DEFAULT '',
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT digest_runs_content_mode_check CHECK (content_mode IN ('deterministic','ai')),
  ADD CONSTRAINT digest_runs_selection_metadata_check CHECK (jsonb_typeof(selection_metadata) = 'object');

UPDATE digest_runs SET local_date = digest_date WHERE local_date IS NULL;
ALTER TABLE digest_runs ALTER COLUMN local_date SET NOT NULL;
CREATE UNIQUE INDEX digest_runs_local_date_idx ON digest_runs(local_date);

ALTER TABLE digest_items
  ADD COLUMN title_snapshot text NOT NULL DEFAULT '',
  ADD COLUMN summary_snapshot text NOT NULL DEFAULT '',
  ADD COLUMN selection_metadata jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN dismissed_at timestamptz,
  ADD CONSTRAINT digest_items_selection_metadata_check CHECK (jsonb_typeof(selection_metadata) = 'object');

CREATE TABLE digest_jobs (
  id text PRIMARY KEY,
  local_date date NOT NULL UNIQUE,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'queued',
  requested_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT digest_jobs_status_check CHECK (status IN ('queued','running','completed','failed')),
  CONSTRAINT digest_jobs_requested_by_check CHECK (requested_by IN ('cron','manual'))
);
CREATE INDEX digest_jobs_status_idx ON digest_jobs(status, created_at);
