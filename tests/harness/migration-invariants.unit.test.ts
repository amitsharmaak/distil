import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tenantMigrationManifest } from "@/lib/postgres/tenant-migration/manifest";
import {
  findTenantIsolationActivation,
  findTenantMigrationEvidence,
  tenantManifestInvariantSpecs,
} from "../support/migration-invariants";

describe("tenant migration evidence", () => {
  it("requires user_id, RLS enablement, and a policy", () => {
    expect(
      findTenantMigrationEvidence(resolve(__dirname, "../fixtures/phase3/migrations"))
    ).toMatchObject({
      present: true,
      files: ["0001_tenant_probe.sql"],
      signals: {
        userColumn: true,
        rlsEnabled: true,
        policyCreated: true,
      },
    });
    expect(findTenantMigrationEvidence(resolve(__dirname, "../fixtures/migrations"))).toMatchObject(
      {
        present: false,
      }
    );
  });

  it("does not allow a workspace-only migration to activate the Phase 3 gate", () => {
    expect(
      findTenantMigrationEvidence(
        resolve(__dirname, "../fixtures/phase3/workspace-only-migrations")
      )
    ).toMatchObject({
      present: false,
      signals: {
        userColumn: false,
        rlsEnabled: true,
        policyCreated: true,
      },
    });
  });

  it("waits for every frozen Phase 2 and Wave 0 table, not one incidental tenant marker", () => {
    const fixtureMigrations = resolve(__dirname, "../fixtures/phase3/migrations");
    const activation = findTenantIsolationActivation(fixtureMigrations, tenantMigrationManifest);

    expect(activation.ready).toBe(false);
    expect(activation.missing).toEqual(expect.arrayContaining(["table marker: items"]));
  });

  it("generates one strict invariant specification for every manifest table", () => {
    const specs = tenantManifestInvariantSpecs(tenantMigrationManifest);
    const chunks = specs.find(({ tableName }) => tableName === "content_chunks")!;

    expect(specs).toHaveLength(tenantMigrationManifest.tables.length);
    expect(specs.every((spec) => spec.tenantReferences?.tableName === "users")).toBe(true);
    expect(chunks.ownershipReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "content_version_item",
          sourceColumns: ["content_version_id", "item_id"],
          targetTable: "item_content_versions",
          targetColumns: ["id", "item_id"],
        }),
      ])
    );
  });
});

describe("P7 performance index migration", () => {
  // Statements only: the header comments explain the CONCURRENTLY and jsonb_path_ops choices.
  const migration = readFileSync(
    resolve(process.cwd(), "src/lib/postgres/tenant-migrations/0010_perf_indexes.sql"),
    "utf8"
  )
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  it("adds only the additive, idempotent, tenant-leading signal index and the summary hash column", () => {
    expect(migration).toContain(
      "CHECK (stage IN ('expand','backfill','contract','lifecycle','returning-auth','perf-indexes'))"
    );
    expect(migration).toMatch(
      /CREATE INDEX IF NOT EXISTS item_events_user_type_occurred_idx\s+ON item_events\(user_id, event_type, occurred_at DESC\)/
    );
    // Unreachable under forced RLS for the runtime role (see the migration header); an index
    // the planner cannot use is write cost only.
    expect(migration).not.toContain("ON items");
    expect(migration).not.toContain("gin(");
    expect(migration).toContain(
      "ALTER TABLE ai_summaries\n  ADD COLUMN IF NOT EXISTS content_hash text"
    );
    for (const forbidden of [
      "CONCURRENTLY",
      "DROP TABLE",
      "DROP COLUMN",
      "DISABLE ROW LEVEL",
      "GRANT ",
    ]) {
      expect(migration).not.toContain(forbidden);
    }
  });
});

describe("Adaptive summaries S1 migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "src/lib/postgres/tenant-migrations/0011_summary_structure.sql"),
    "utf8"
  )
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  it("adds two nullable ai_summaries columns and rebuilds only that tenant view", () => {
    expect(migration).toContain(
      "CHECK (stage IN ('expand','backfill','contract','lifecycle','returning-auth','perf-indexes','summary-structure'))"
    );
    expect(migration).toMatch(
      /ALTER TABLE ai_summaries\s+ADD COLUMN IF NOT EXISTS structured jsonb,\s+ADD COLUMN IF NOT EXISTS prompt_version text;/
    );
    expect(migration).not.toContain("NOT NULL");
    // PostgreSQL froze the view's column list at creation; without the rebuild the runtime role
    // cannot see the new columns.
    expect(migration).toMatch(
      /CREATE OR REPLACE VIEW tenant_api\.ai_summaries WITH \(security_barrier=true\) AS\s+SELECT \* FROM public\.ai_summaries\s+WHERE user_id = nullif\(current_setting\('app\.user_id', true\), ''\)::uuid\s+WITH CASCADED CHECK OPTION;/
    );
    expect(migration.match(/CREATE OR REPLACE VIEW/g)).toHaveLength(1);
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_api.ai_summaries TO distil_runtime;"
    );
    expect(migration.match(/GRANT /g)).toHaveLength(1);
    for (const forbidden of [
      "CONCURRENTLY",
      "DROP TABLE",
      "DROP COLUMN",
      "DROP VIEW",
      "DISABLE ROW LEVEL",
      "UPDATE ai_summaries",
      "DELETE FROM",
    ]) {
      expect(migration).not.toContain(forbidden);
    }
  });
});

describe("Inline search F1 migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "src/lib/postgres/tenant-migrations/0012_feed_search.sql"),
    "utf8"
  )
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  it("adds two generated items columns, one tenant-scoped index, and rebuilds only the items view", () => {
    expect(migration).toContain(
      "CHECK (stage IN ('expand','backfill','contract','lifecycle','returning-auth','perf-indexes','summary-structure','feed-search'))"
    );
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS feed_search_vector tsvector GENERATED ALWAYS AS ("
    );
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS site text GENERATED ALWAYS AS (");
    expect(migration.match(/STORED/g)).toHaveLength(2);
    expect(migration).not.toContain("NOT NULL");
    expect(migration).toContain(
      "CREATE INDEX IF NOT EXISTS items_user_site_idx ON items(user_id, site);"
    );
    expect(migration.match(/CREATE INDEX/g)).toHaveLength(1);
    // PostgreSQL froze the view's column list at creation; without the rebuild the runtime role
    // cannot see the new columns.
    expect(migration).toMatch(
      /CREATE OR REPLACE VIEW tenant_api\.items WITH \(security_barrier=true\) AS\s+SELECT \* FROM public\.items\s+WHERE user_id = nullif\(current_setting\('app\.user_id', true\), ''\)::uuid\s+WITH CASCADED CHECK OPTION;/
    );
    expect(migration.match(/CREATE OR REPLACE VIEW/g)).toHaveLength(1);
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_api.items TO distil_runtime;"
    );
    expect(migration.match(/GRANT /g)).toHaveLength(1);
    for (const forbidden of [
      "CONCURRENTLY",
      "DROP TABLE",
      "DROP COLUMN",
      "DROP VIEW",
      "DISABLE ROW LEVEL",
      "UPDATE items",
      "DELETE FROM",
      "USING gin",
    ]) {
      expect(migration).not.toContain(forbidden);
    }
  });
});
