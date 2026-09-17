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
