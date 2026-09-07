import {
  buildTenantMigrationReport,
  normalizeExplicitAmitUserId,
  verifyAfterAgainstBaseline,
  verifyDiscoveredSchema,
} from "../tenant-migration/verifier";
import type {
  QueryRow,
  ReadonlyQueryClient,
  TenantMigrationManifest,
  TenantMigrationReport,
} from "../tenant-migration/types";

const ownerId = "123e4567-e89b-42d3-a456-426614174000";

const manifest: TenantMigrationManifest = {
  contractVersion: 1,
  id: "test-manifest",
  applicationSchemas: ["public"],
  immutableOwner: {
    label: "Amit",
    source: "explicit-cli-argument",
    column: "user_id",
    sqlType: "uuid",
  },
  tables: [
    {
      schema: "public",
      table: "records",
      tenantBearing: true,
      ownerColumn: "user_id",
      identityColumns: ["id"],
      highValueColumns: ["body"],
      references: [
        { name: "parent", columns: ["parent_id"], targetTable: "records", targetColumns: ["id"] },
      ],
      uniqueness: [{ name: "slug", columns: ["slug"] }],
      jsonColumns: [
        {
          column: "payload",
          references: [
            {
              name: "payload_items",
              column: "payload",
              path: "$.itemId",
              targetTable: "records",
              targetColumn: "id",
            },
          ],
        },
      ],
      queue: { statusColumn: "status", kindColumn: "kind" },
    },
  ],
  controlTables: [],
};

function discovery(withOwner = true): QueryRow[] {
  return [
    "id",
    "body",
    "parent_id",
    "slug",
    "payload",
    "status",
    "kind",
    ...(withOwner ? ["user_id"] : []),
  ].map((column) => ({
    table_schema: "public",
    table_name: "records",
    column_name: column,
    data_type: column === "payload" ? "jsonb" : column === "user_id" ? "uuid" : "text",
    udt_name: column === "payload" ? "jsonb" : column === "user_id" ? "uuid" : "text",
  }));
}

class FakeClient implements ReadonlyQueryClient {
  constructor(
    private readonly options: {
      withOwner?: boolean;
      nullOwners?: number;
      mismatchedOwners?: number;
      checksum?: string;
      orphanCount?: number;
      collisions?: number;
      jsonOrphans?: number;
    } = {}
  ) {}

  async unsafe(query: string): Promise<readonly QueryRow[]> {
    if (query.includes("information_schema.columns"))
      return discovery(this.options.withOwner ?? true);
    if (query.includes("stable_checksum")) {
      return [{ row_count: "2", stable_checksum: this.options.checksum ?? "stable" }];
    }
    if (query.includes("value_digest")) return [{ checksum: "high-value" }];
    if (query.includes("mismatched_count")) {
      return [
        {
          null_count: String(this.options.nullOwners ?? 0),
          mismatched_count: String(this.options.mismatchedOwners ?? 0),
        },
      ];
    }
    if (query.includes("jsonb_path_query")) {
      return [{ reference_count: "1", orphan_count: String(this.options.jsonOrphans ?? 0) }];
    }
    if (query.includes("collision_groups")) {
      const collisions = this.options.collisions ?? 0;
      return [{ collision_groups: String(collisions), collision_rows: String(collisions * 2) }];
    }
    if (query.includes(" AS orphan_count")) {
      return [{ orphan_count: String(this.options.orphanCount ?? 0) }];
    }
    if (query.includes("GROUP BY") && query.includes(" AS status")) {
      return [{ status: "pending", kind: "capture", count: "2" }];
    }
    throw new Error(`Unexpected query: ${query}`);
  }
}

describe("tenant migration verifier", () => {
  it("normalizes UUIDs but rejects email and omitted identity substitutes", () => {
    expect(normalizeExplicitAmitUserId(ownerId.toUpperCase())).toBe(ownerId);
    expect(() => normalizeExplicitAmitUserId("amit@example.com")).toThrow();
    expect(() => normalizeExplicitAmitUserId("single-user")).toThrow();
  });

  it("produces a read-only, repeatable two-pass rehearsal projection", async () => {
    const report = await buildTenantMigrationReport({
      client: new FakeClient({ withOwner: false }),
      ownerId,
      stage: "rehearsal",
      manifest,
      generatedAt: new Date("2026-09-07T00:00:00.000Z"),
    });

    expect(report.verification).toEqual({ passed: true, failures: [] });
    expect(report.tables[0]).toMatchObject({
      rowCount: 2,
      stableChecksum: "stable",
      highValueChecksums: { body: "high-value" },
      ownership: {
        columnPresent: false,
        nullOwnerCount: null,
        mismatchedOwnerCount: null,
        projectedNullOwnerCount: 0,
      },
      queueState: [{ status: "pending", kind: "capture", count: 2 }],
      jsonReferences: [{ references: 1, orphans: 0 }],
    });
    expect(report.rehearsal).toMatchObject({
      readOnly: true,
      projectionPasses: 2,
      assignments: [{ table: "public.records", firstPass: 2, secondPass: 0 }],
      idempotent: true,
    });
    expect(report.rehearsal!.firstFingerprint).toBe(report.rehearsal!.secondFingerprint);
  });

  it("fails an after report on null/wrong owners, orphans, and collisions", async () => {
    const report = await buildTenantMigrationReport({
      client: new FakeClient({
        nullOwners: 1,
        mismatchedOwners: 1,
        orphanCount: 1,
        collisions: 1,
        jsonOrphans: 1,
      }),
      ownerId,
      stage: "after",
      manifest,
    });
    expect(report.verification.passed).toBe(false);
    expect(report.verification.failures.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "NULL_OWNER",
        "WRONG_OWNER",
        "RELATIONAL_ORPHANS",
        "UNIQUENESS_COLLISIONS",
        "JSON_REFERENCE_ORPHANS",
      ])
    );
  });

  it("fails closed on unknown tables, JSON columns, and missing after-owner columns", () => {
    const discovered = discovery(false).map((column) => ({
      schema: String(column.table_schema),
      table: String(column.table_name),
      column: String(column.column_name),
      dataType: String(column.data_type),
      udtName: String(column.udt_name),
    }));
    const failures = verifyDiscoveredSchema(
      manifest,
      [
        ...discovered,
        {
          schema: "public",
          table: "records",
          column: "unclassified_json",
          dataType: "jsonb",
          udtName: "jsonb",
        },
        {
          schema: "public",
          table: "surprise",
          column: "id",
          dataType: "text",
          udtName: "text",
        },
      ],
      "after"
    );
    expect(failures.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "UNCLASSIFIED_TABLE",
        "UNCLASSIFIED_JSON_COLUMN",
        "MISSING_OWNER_COLUMN",
      ])
    );
  });

  it("preserves one invariant fingerprint across before and after ownership expansion", async () => {
    const before = await buildTenantMigrationReport({
      client: new FakeClient({ withOwner: false }),
      ownerId,
      stage: "before",
      manifest,
    });
    const after = await buildTenantMigrationReport({
      client: new FakeClient(),
      ownerId,
      stage: "after",
      manifest,
    });
    expect(before.invariantFingerprint).toBe(after.invariantFingerprint);
    expect(verifyAfterAgainstBaseline(before, after)).toEqual([]);
  });

  it("detects a changed UUID or data checksum across the migration window", async () => {
    const before = await buildTenantMigrationReport({
      client: new FakeClient({ withOwner: false }),
      ownerId,
      stage: "before",
      manifest,
    });
    const changed = (await buildTenantMigrationReport({
      client: new FakeClient({ checksum: "changed" }),
      ownerId,
      stage: "after",
      manifest,
    })) as TenantMigrationReport;
    const otherOwner = {
      ...changed,
      immutableOwner: {
        ...changed.immutableOwner,
        userId: "223e4567-e89b-42d3-a456-426614174000",
      },
    };
    expect(verifyAfterAgainstBaseline(before, changed).map(({ code }) => code)).toContain(
      "DATA_CHANGED"
    );
    expect(verifyAfterAgainstBaseline(before, otherOwner).map(({ code }) => code)).toContain(
      "OWNER_CHANGED"
    );
  });
});
