import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "src/lib/postgres/migrations/0002_phase2_core.sql"),
  "utf8"
);

describe("Phase 2 core PostgreSQL migration", () => {
  it("is additive and defines the knowledge-organization tables", () => {
    expect(migration).toMatch(/ALTER TABLE items/);
    expect(migration).not.toMatch(/DROP (TABLE|COLUMN)/);
    expect([...migration.matchAll(/CREATE TABLE ([a-z_]+)/g)].map((match) => match[1])).toEqual([
      "item_notes",
      "annotations",
      "collections",
      "collection_items",
      "item_events",
      "digest_runs",
      "digest_items",
    ]);
  });

  it("constrains lifecycle, anchoring, event, and digest values", () => {
    expect(migration).toMatch(/reading_progress >= 0 AND reading_progress <= 1/);
    expect(migration).toMatch(/manual_priority IN \('high','medium','low'\)/);
    expect(migration).toMatch(/status IN \('active','orphaned'\)/);
    expect(migration).toMatch(/jsonb_typeof\(metadata\) = 'object'/);
    expect(migration).toMatch(/status IN \('pending','ready','degraded','failed'\)/);
    expect(migration).toMatch(/category IN \('priority','resurfaced'\)/);
  });

  it("makes notes singular, memberships idempotent, events keyed, and digests reproducible", () => {
    expect(migration).toMatch(/item_id text PRIMARY KEY REFERENCES items\(id\) ON DELETE CASCADE/);
    expect(migration).toMatch(/PRIMARY KEY \(collection_id, item_id\)/);
    expect(migration).toMatch(/event_key text NOT NULL UNIQUE/);
    expect(migration).toMatch(/digest_date date NOT NULL UNIQUE/);
    expect(migration).toMatch(/UNIQUE \(digest_run_id, position\)/);
    expect(migration).toMatch(/BEFORE UPDATE ON item_events/);
  });
});
