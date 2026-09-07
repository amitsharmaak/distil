ALTER TABLE items
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN read_at timestamptz,
  ADD COLUMN last_opened_at timestamptz,
  ADD COLUMN reading_progress double precision NOT NULL DEFAULT 0,
  ADD COLUMN manual_priority text,
  ADD CONSTRAINT items_reading_progress_check CHECK (reading_progress >= 0 AND reading_progress <= 1),
  ADD CONSTRAINT items_manual_priority_check CHECK (manual_priority IS NULL OR manual_priority IN ('high','medium','low'));

CREATE INDEX items_archived_idx ON items(archived_at);
CREATE INDEX items_last_opened_idx ON items(last_opened_at DESC);

CREATE TABLE item_notes (
  item_id text PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE annotations (
  id text PRIMARY KEY,
  item_id text NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  selected_quote text NOT NULL,
  prefix text NOT NULL DEFAULT '',
  suffix text NOT NULL DEFAULT '',
  start_offset integer,
  end_offset integer,
  content_hash text NOT NULL,
  content_version text NOT NULL,
  comment text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT annotations_quote_check CHECK (length(selected_quote) > 0),
  CONSTRAINT annotations_status_check CHECK (status IN ('active','orphaned')),
  CONSTRAINT annotations_offsets_check CHECK (
    (start_offset IS NULL AND end_offset IS NULL) OR
    (start_offset IS NOT NULL AND end_offset IS NOT NULL AND start_offset >= 0 AND end_offset > start_offset)
  )
);
CREATE INDEX annotations_item_idx ON annotations(item_id, created_at);
CREATE INDEX annotations_status_idx ON annotations(item_id, status);

CREATE TABLE collections (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT collections_name_check CHECK (length(trim(name)) > 0)
);

CREATE TABLE collection_items (
  collection_id text NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  item_id text NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  added_at timestamptz NOT NULL,
  PRIMARY KEY (collection_id, item_id),
  CONSTRAINT collection_items_position_check CHECK (position >= 0)
);
CREATE INDEX collection_items_item_idx ON collection_items(item_id);
CREATE INDEX collection_items_order_idx ON collection_items(collection_id, position, added_at);

CREATE TABLE item_events (
  id text PRIMARY KEY,
  event_key text NOT NULL UNIQUE,
  item_id text NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL,
  CONSTRAINT item_events_type_check CHECK (event_type IN (
    'opened','marked_read','marked_unread','completed','archived','restored',
    'collection_added','collection_removed','feedback_recorded','citation_clicked',
    'resurfaced','resurfacing_dismissed'
  )),
  CONSTRAINT item_events_metadata_check CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX item_events_item_idx ON item_events(item_id, occurred_at DESC);
CREATE INDEX item_events_type_idx ON item_events(event_type, occurred_at DESC);

CREATE TABLE digest_runs (
  id text PRIMARY KEY,
  digest_date date NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  dismissed_at timestamptz,
  CONSTRAINT digest_runs_status_check CHECK (status IN ('pending','ready','degraded','failed'))
);

CREATE TABLE digest_items (
  digest_run_id text NOT NULL REFERENCES digest_runs(id) ON DELETE CASCADE,
  item_id text NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  category text NOT NULL,
  position integer NOT NULL,
  reason text NOT NULL,
  PRIMARY KEY (digest_run_id, item_id),
  UNIQUE (digest_run_id, position),
  CONSTRAINT digest_items_category_check CHECK (category IN ('priority','resurfaced')),
  CONSTRAINT digest_items_position_check CHECK (position >= 0)
);
CREATE INDEX digest_items_item_idx ON digest_items(item_id);

CREATE FUNCTION reject_item_event_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'item_events are immutable';
END;
$$;

CREATE TRIGGER item_events_reject_update
BEFORE UPDATE ON item_events
FOR EACH ROW EXECUTE FUNCTION reject_item_event_update();
