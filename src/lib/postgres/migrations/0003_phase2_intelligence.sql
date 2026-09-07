CREATE TABLE item_content_versions (
  id text PRIMARY KEY,
  item_id text NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  version integer NOT NULL,
  content_hash text NOT NULL,
  extractor_version text NOT NULL,
  source text NOT NULL,
  content text NOT NULL,
  character_count integer NOT NULL,
  token_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item_content_versions_version_check CHECK (version > 0),
  CONSTRAINT item_content_versions_hash_check CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT item_content_versions_source_check CHECK (source IN ('full_content','summary','raw_content')),
  CONSTRAINT item_content_versions_content_check CHECK (length(content) > 0),
  CONSTRAINT item_content_versions_counts_check CHECK (character_count > 0 AND token_count > 0),
  UNIQUE (item_id, version),
  UNIQUE (item_id, content_hash, extractor_version),
  UNIQUE (id, item_id)
);
CREATE INDEX item_content_versions_item_created_idx
  ON item_content_versions(item_id, created_at DESC);

CREATE TABLE content_chunks (
  id text PRIMARY KEY,
  content_version_id text NOT NULL,
  item_id text NOT NULL,
  ordinal integer NOT NULL,
  content text NOT NULL,
  content_hash text NOT NULL,
  start_offset integer NOT NULL,
  end_offset integer NOT NULL,
  token_count integer NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS
    (to_tsvector('english', coalesce(content, ''))) STORED,
  embedding_model text,
  embedding_dimensions integer,
  embedding_status text NOT NULL DEFAULT 'unconfigured',
  embedding_error text,
  embedding_updated_at timestamptz,
  embedded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_chunks_ordinal_check CHECK (ordinal >= 0),
  CONSTRAINT content_chunks_content_check CHECK (length(content) > 0),
  CONSTRAINT content_chunks_hash_check CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT content_chunks_offsets_check CHECK (start_offset >= 0 AND end_offset > start_offset),
  CONSTRAINT content_chunks_token_count_check CHECK (token_count > 0),
  CONSTRAINT content_chunks_embedding_status_check
    CHECK (embedding_status IN ('unconfigured','pending','ready','failed','stale')),
  CONSTRAINT content_chunks_embedding_dimensions_check
    CHECK (embedding_dimensions IS NULL OR embedding_dimensions > 0),
  CONSTRAINT content_chunks_ready_embedding_check
    CHECK (embedding_status <> 'ready' OR
      (embedding_model IS NOT NULL AND embedding_dimensions IS NOT NULL AND embedded_at IS NOT NULL)),
  CONSTRAINT content_chunks_unconfigured_embedding_check
    CHECK (embedding_status <> 'unconfigured' OR
      (embedding_model IS NULL AND embedding_dimensions IS NULL AND embedded_at IS NULL)),
  CONSTRAINT content_chunks_version_item_fk FOREIGN KEY (content_version_id, item_id)
    REFERENCES item_content_versions(id, item_id) ON DELETE CASCADE,
  UNIQUE (content_version_id, ordinal),
  UNIQUE (id, content_version_id)
);
CREATE INDEX content_chunks_item_idx ON content_chunks(item_id, content_version_id, ordinal);
CREATE INDEX content_chunks_search_idx ON content_chunks USING gin(search_vector);

CREATE TABLE intelligence_artifacts (
  id text PRIMARY KEY,
  item_id text NOT NULL,
  content_version_id text NOT NULL,
  artifact_type text NOT NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  content text,
  content_hash text,
  provenance text NOT NULL DEFAULT 'generated',
  prompt_version text,
  provider text,
  model text,
  is_current boolean NOT NULL DEFAULT false,
  supersedes_artifact_id text REFERENCES intelligence_artifacts(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT intelligence_artifacts_type_check
    CHECK (artifact_type IN ('brief_summary','detailed_summary','claims')),
  CONSTRAINT intelligence_artifacts_version_check CHECK (version > 0),
  CONSTRAINT intelligence_artifacts_status_check
    CHECK (status IN ('pending','ready','degraded','failed','stale')),
  CONSTRAINT intelligence_artifacts_hash_check
    CHECK (content_hash IS NULL OR content_hash ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT intelligence_artifacts_provenance_check
    CHECK (provenance IN ('generated','deterministic_fallback','legacy_unverified')),
  CONSTRAINT intelligence_artifacts_completion_check
    CHECK (status = 'pending' OR completed_at IS NOT NULL),
  CONSTRAINT intelligence_artifacts_current_check
    CHECK (is_current = false OR status IN ('ready','degraded')),
  CONSTRAINT intelligence_artifacts_summary_content_check
    CHECK (artifact_type = 'claims' OR status NOT IN ('ready','degraded') OR
      (content IS NOT NULL AND content_hash IS NOT NULL)),
  CONSTRAINT intelligence_artifacts_metadata_check CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT intelligence_artifacts_version_item_fk FOREIGN KEY (content_version_id, item_id)
    REFERENCES item_content_versions(id, item_id) ON DELETE CASCADE,
  UNIQUE (item_id, artifact_type, version)
);
CREATE UNIQUE INDEX intelligence_artifacts_current_idx
  ON intelligence_artifacts(item_id, artifact_type) WHERE is_current = true;
CREATE INDEX intelligence_artifacts_content_version_idx
  ON intelligence_artifacts(content_version_id);
CREATE INDEX intelligence_artifacts_status_idx
  ON intelligence_artifacts(status, created_at);

CREATE TABLE intelligence_claims (
  id text PRIMARY KEY,
  artifact_id text NOT NULL REFERENCES intelligence_artifacts(id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  claim text NOT NULL,
  claim_hash text NOT NULL,
  confidence double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_claims_ordinal_check CHECK (ordinal >= 0),
  CONSTRAINT intelligence_claims_text_check CHECK (length(claim) > 0),
  CONSTRAINT intelligence_claims_hash_check CHECK (claim_hash ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT intelligence_claims_confidence_check
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  UNIQUE (artifact_id, ordinal)
);
CREATE INDEX intelligence_claims_artifact_idx ON intelligence_claims(artifact_id);

CREATE TABLE claim_evidence (
  claim_id text NOT NULL REFERENCES intelligence_claims(id) ON DELETE CASCADE,
  chunk_id text NOT NULL REFERENCES content_chunks(id) ON DELETE CASCADE,
  start_offset integer NOT NULL,
  end_offset integer NOT NULL,
  exact_excerpt text NOT NULL,
  evidence_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (claim_id, chunk_id, start_offset, end_offset),
  CONSTRAINT claim_evidence_offsets_check CHECK (start_offset >= 0 AND end_offset > start_offset),
  CONSTRAINT claim_evidence_excerpt_check CHECK (length(exact_excerpt) > 0),
  CONSTRAINT claim_evidence_hash_check CHECK (evidence_hash ~ '^sha256:[0-9a-f]{64}$')
);
CREATE INDEX claim_evidence_chunk_idx ON claim_evidence(chunk_id);

CREATE TABLE knowledge_backfill_checkpoints (
  job_key text PRIMARY KEY,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  cursor text,
  checkpoint jsonb NOT NULL DEFAULT '{}',
  processed_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  attempt integer NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_backfill_type_check
    CHECK (job_type IN ('content_versions','chunks','legacy_artifacts','embeddings')),
  CONSTRAINT knowledge_backfill_status_check
    CHECK (status IN ('pending','running','completed','failed')),
  CONSTRAINT knowledge_backfill_counts_check
    CHECK (processed_count >= 0 AND failed_count >= 0 AND attempt >= 0),
  CONSTRAINT knowledge_backfill_checkpoint_check CHECK (jsonb_typeof(checkpoint) = 'object'),
  CONSTRAINT knowledge_backfill_completion_check
    CHECK (status <> 'completed' OR completed_at IS NOT NULL)
);
CREATE INDEX knowledge_backfill_status_idx
  ON knowledge_backfill_checkpoints(status, updated_at);

CREATE FUNCTION reject_content_version_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'item_content_versions are immutable';
END;
$$;

CREATE TRIGGER item_content_versions_reject_update
BEFORE UPDATE ON item_content_versions
FOR EACH ROW EXECUTE FUNCTION reject_content_version_update();

CREATE FUNCTION protect_content_chunk_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.content_version_id IS DISTINCT FROM OLD.content_version_id
    OR NEW.item_id IS DISTINCT FROM OLD.item_id
    OR NEW.ordinal IS DISTINCT FROM OLD.ordinal
    OR NEW.content IS DISTINCT FROM OLD.content
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
    OR NEW.start_offset IS DISTINCT FROM OLD.start_offset
    OR NEW.end_offset IS DISTINCT FROM OLD.end_offset
    OR NEW.token_count IS DISTINCT FROM OLD.token_count THEN
    RAISE EXCEPTION 'content chunk identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER content_chunks_protect_identity
BEFORE UPDATE ON content_chunks
FOR EACH ROW EXECUTE FUNCTION protect_content_chunk_identity();

CREATE FUNCTION validate_artifact_supersession() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  prior_item_id text;
  prior_artifact_type text;
  prior_version integer;
BEGIN
  IF NEW.supersedes_artifact_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT item_id, artifact_type, version
    INTO prior_item_id, prior_artifact_type, prior_version
  FROM intelligence_artifacts
  WHERE id = NEW.supersedes_artifact_id;

  IF prior_item_id IS DISTINCT FROM NEW.item_id
    OR prior_artifact_type IS DISTINCT FROM NEW.artifact_type
    OR prior_version >= NEW.version THEN
    RAISE EXCEPTION 'superseded artifact must be an earlier version of the same item and type';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER intelligence_artifacts_validate_supersession
BEFORE INSERT OR UPDATE OF supersedes_artifact_id, item_id, artifact_type, version
ON intelligence_artifacts
FOR EACH ROW EXECUTE FUNCTION validate_artifact_supersession();

CREATE FUNCTION validate_claim_evidence_version() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  artifact_content_version text;
  chunk_content_version text;
BEGIN
  SELECT artifacts.content_version_id INTO artifact_content_version
  FROM intelligence_claims claims
  JOIN intelligence_artifacts artifacts ON artifacts.id = claims.artifact_id
  WHERE claims.id = NEW.claim_id;

  SELECT content_version_id INTO chunk_content_version
  FROM content_chunks WHERE id = NEW.chunk_id;

  IF artifact_content_version IS DISTINCT FROM chunk_content_version THEN
    RAISE EXCEPTION 'claim evidence must reference the artifact content version';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER claim_evidence_validate_version
BEFORE INSERT OR UPDATE ON claim_evidence
FOR EACH ROW EXECUTE FUNCTION validate_claim_evidence_version();
