import { getTableName } from "drizzle-orm";

import * as schema from "../schema";
import { tenantBearingTableNames, tenantMigrationManifest } from "../tenant-migration/manifest";
import { validateManifest } from "../tenant-migration/verifier";

describe("Phase 3 tenant migration manifest", () => {
  it("classifies every Drizzle application table as tenant-bearing", () => {
    const schemaTables = Object.values(schema)
      .map((table) => `public.${getTableName(table)}`)
      .sort();

    expect(tenantBearingTableNames.slice().sort()).toEqual(schemaTables);
    expect(tenantBearingTableNames).toHaveLength(36);
  });

  it("classifies the migration ledger explicitly as non-tenant control data", () => {
    expect(tenantMigrationManifest.controlTables).toEqual([
      expect.objectContaining({ table: "distil_migrations", tenantBearing: false }),
    ]);
  });

  it("uses one explicit immutable UUID ownership contract", () => {
    expect(tenantMigrationManifest.immutableOwner).toEqual({
      label: "Amit",
      source: "explicit-cli-argument",
      column: "user_id",
      sqlType: "uuid",
    });
    expect(tenantMigrationManifest.tables.every((table) => table.ownerColumn === "user_id")).toBe(
      true
    );
  });

  it("classifies every JSON column either as referential or intentionally non-referential", () => {
    for (const table of tenantMigrationManifest.tables) {
      for (const column of table.jsonColumns) {
        expect(Boolean(column.noTenantReferences) || (column.references?.length ?? 0) > 0).toBe(
          true
        );
      }
    }
    expect(() => validateManifest(tenantMigrationManifest)).not.toThrow();
  });

  it("captures queue, JSON-reference, and high-value integrity surfaces", () => {
    expect(
      tenantMigrationManifest.tables.filter((table) => table.queue).map((table) => table.table)
    ).toEqual(
      expect.arrayContaining([
        "approval_queue",
        "capture_requests",
        "digest_jobs",
        "job_queue",
        "knowledge_backfill_checkpoints",
        "publisher_queue",
      ])
    );
    expect(
      tenantMigrationManifest.tables.flatMap((table) =>
        table.jsonColumns.flatMap((column) => column.references ?? [])
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "source_items", targetTable: "items" }),
        expect.objectContaining({ name: "content_version_ids" }),
        expect.objectContaining({ name: "citation_items" }),
      ])
    );
    expect(tenantMigrationManifest.tables.every((table) => table.highValueColumns.length > 0)).toBe(
      true
    );
  });
});
