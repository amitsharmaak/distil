import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "src/lib/postgres/migrations/0004_phase2_digests.sql"),
  "utf8"
);

describe("Phase 2 digest PostgreSQL migration", () => {
  it("adds opt-in preferences and a durable, idempotent digest queue", () => {
    expect(migration).toMatch(/CREATE TABLE personal_preferences/);
    expect(migration).toMatch(/digest_enabled boolean NOT NULL DEFAULT false/);
    expect(migration).toMatch(/CREATE TABLE digest_jobs/);
    expect(migration).toMatch(/local_date date NOT NULL UNIQUE/);
    expect(migration).toMatch(/idempotency_key text NOT NULL UNIQUE/);
  });

  it("preserves reproducible selections and single local-date digests", () => {
    expect(migration).toMatch(/ADD COLUMN local_date date/);
    expect(migration).toMatch(/CREATE UNIQUE INDEX digest_runs_local_date_idx/);
    expect(migration).toMatch(/selection_metadata jsonb NOT NULL DEFAULT '\{\}'/);
    expect(migration).toMatch(/title_text text NOT NULL DEFAULT ''/);
    expect(migration).toMatch(/title_snapshot text NOT NULL DEFAULT ''/);
    expect(migration).toMatch(/ADD COLUMN dismissed_at timestamptz/);
    expect(migration).not.toMatch(/DROP (TABLE|COLUMN)/);
  });
});
