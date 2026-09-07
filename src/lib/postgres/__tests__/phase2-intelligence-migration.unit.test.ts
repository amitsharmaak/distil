import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "src/lib/postgres/migrations/0003_phase2_intelligence.sql"),
  "utf8"
);

describe("Phase 2 intelligence PostgreSQL migration", () => {
  it("is additive and introduces the versioned intelligence tables", () => {
    expect(migration).not.toMatch(/DROP (TABLE|COLUMN)/);
    expect([...migration.matchAll(/CREATE TABLE ([a-z_]+)/g)].map((match) => match[1])).toEqual([
      "item_content_versions",
      "content_chunks",
      "intelligence_artifacts",
      "intelligence_claims",
      "claim_evidence",
      "knowledge_backfill_checkpoints",
    ]);
  });

  it("keeps embedding storage provider-neutral until a model is pinned", () => {
    expect(migration).toMatch(/embedding_model text/);
    expect(migration).toMatch(/embedding_dimensions integer/);
    expect(migration).toMatch(/embedding_status text NOT NULL DEFAULT 'unconfigured'/);
    expect(migration).not.toMatch(/CREATE EXTENSION/i);
    expect(migration).not.toMatch(/\bvector\s*\(/i);
    expect(migration).not.toMatch(/USING hnsw/i);
  });

  it("provides full-text chunks with immutable source identity and exact offsets", () => {
    expect(migration).toMatch(/search_vector tsvector GENERATED ALWAYS AS/);
    expect(migration).toMatch(/content_chunks_search_idx ON content_chunks USING gin/);
    expect(migration).toMatch(/start_offset >= 0 AND end_offset > start_offset/);
    expect(migration).toMatch(/item_content_versions_reject_update/);
    expect(migration).toMatch(/content_chunks_protect_identity/);
  });

  it("versions artifacts and requires evidence from the same content version", () => {
    expect(migration).toMatch(/UNIQUE \(item_id, artifact_type, version\)/);
    expect(migration).toMatch(/WHERE is_current = true/);
    expect(migration).toMatch(/status IN \('pending','ready','degraded','failed','stale'\)/);
    expect(migration).toMatch(
      /provenance IN \('generated','deterministic_fallback','legacy_unverified'\)/
    );
    expect(migration).toMatch(/intelligence_artifacts_validate_supersession/);
    expect(migration).toMatch(/claim_evidence_validate_version/);
    expect(migration).toMatch(/claim evidence must reference the artifact content version/);
  });

  it("makes backfill retries converge on one durable checkpoint", () => {
    expect(migration).toMatch(/job_key text PRIMARY KEY/);
    expect(migration).toMatch(/checkpoint jsonb NOT NULL DEFAULT '\{\}'/);
    expect(migration).toMatch(/processed_count >= 0 AND failed_count >= 0 AND attempt >= 0/);
    expect(migration).toMatch(/status <> 'completed' OR completed_at IS NOT NULL/);
  });
});
