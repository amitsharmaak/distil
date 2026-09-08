import type { TenantMigrationManifest, TenantMigrationReport } from "../types";
import {
  buildTenantMigrationReport,
  canonicalJson,
  normalizeExplicitAmitUserId,
  sha256,
  validateManifest,
  verifyAfterAgainstBaseline,
  verifyDiscoveredSchema,
} from "../verifier";

const ownerId = "11111111-1111-4111-8111-111111111111";

function manifest(): TenantMigrationManifest {
  return {
    contractVersion: 1,
    id: "unit-manifest",
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
        table: "things",
        tenantBearing: true,
        ownerColumn: "user_id",
        identityColumns: ["id"],
        highValueColumns: ["title"],
        references: [
          {
            name: "parent",
            columns: ["parent_id"],
            targetTable: "things",
            targetColumns: ["id"],
          },
        ],
        uniqueness: [{ name: "title", columns: ["title"] }],
        jsonColumns: [
          {
            column: "payload",
            references: [
              {
                name: "payload-parent",
                column: "payload",
                path: "$.parentId",
                targetTable: "things",
                targetColumn: "id",
              },
            ],
          },
        ],
        queue: { statusColumn: "status", kindColumn: "kind" },
      },
    ],
    supplementalTables: [
      {
        schema: "public",
        table: "sidecars",
        tenantBearing: true,
        ownerColumn: "user_id",
        lifecycle: "account",
        jsonColumns: [{ column: "metadata", noTenantReferences: "opaque metadata" }],
        reason: "unit coverage",
        introducedIn: "lifecycle",
      },
    ],
    controlTables: [
      {
        schema: "public",
        table: "control_marks",
        tenantBearing: false,
        reason: "control-only",
      },
    ],
  };
}

function columns(includeOwner = true) {
  const names = ["id", "title", "parent_id", "payload", "status", "kind"];
  if (includeOwner) names.push("user_id");
  return [
    ...names.map((column) => ({
      table_schema: "public",
      table_name: "things",
      column_name: column,
      data_type: column === "payload" ? "jsonb" : "text",
      udt_name: column === "user_id" ? "uuid" : "text",
    })),
    {
      table_schema: "public",
      table_name: "sidecars",
      column_name: "metadata",
      data_type: "jsonb",
      udt_name: "jsonb",
    },
  ];
}

function reportClient(discovered = columns(), counts = { orphan: "0", collision: "0", json: "0" }) {
  return {
    unsafe: jest.fn(async (query: string) => {
      if (query.includes("information_schema.columns")) return discovered;
      if (query.includes("stable_checksum")) {
        return [{ row_count: "2", stable_checksum: "stable-checksum" }];
      }
      if (query.includes("AS checksum")) return [{ checksum: "high-value-checksum" }];
      if (query.includes("null_count")) return [{ null_count: "0", mismatched_count: "0" }];
      if (query.includes("reference_count")) {
        return [{ reference_count: "3", orphan_count: counts.json }];
      }
      if (query.includes("AS orphan_count")) return [{ orphan_count: counts.orphan }];
      if (query.includes("collision_groups")) {
        return [{ collision_groups: counts.collision, collision_rows: counts.collision }];
      }
      if (query.includes("AS status")) return [{ status: "pending", kind: null, count: "2" }];
      throw new Error(`Unexpected query: ${query}`);
    }),
  };
}

describe("tenant migration verifier", () => {
  it("normalizes the explicit owner and hashes canonical nested objects", () => {
    expect(normalizeExplicitAmitUserId(ownerId.toUpperCase())).toBe(ownerId);
    expect(() => normalizeExplicitAmitUserId("amit")).toThrow("RFC 4122 UUID");
    expect(canonicalJson({ z: 1, a: { d: 2, b: 1 } })).toBe('{"a":{"b":1,"d":2},"z":1}');
    expect(sha256({ a: [2, { z: 1, b: 2 }] })).toBe(sha256({ a: [2, { b: 2, z: 1 }] }));
  });

  it.each([
    [
      "unsupported contract",
      (value: TenantMigrationManifest) => ({ ...value, contractVersion: 2 }),
    ],
    ["empty tenant tables", (value: TenantMigrationManifest) => ({ ...value, tables: [] })],
    [
      "schema outside allowlist",
      (value: TenantMigrationManifest) => ({ ...value, applicationSchemas: ["other"] }),
    ],
    [
      "duplicate classification",
      (value: TenantMigrationManifest) => ({
        ...value,
        controlTables: [{ ...value.controlTables[0], table: "things" }],
      }),
    ],
    [
      "missing identity",
      (value: TenantMigrationManifest) => ({
        ...value,
        tables: [{ ...value.tables[0], identityColumns: [] }],
      }),
    ],
    [
      "unclassified relationship target",
      (value: TenantMigrationManifest) => ({
        ...value,
        tables: [
          {
            ...value.tables[0],
            references: [{ ...value.tables[0].references[0], targetTable: "missing" }],
          },
        ],
      }),
    ],
    [
      "mismatched relationship",
      (value: TenantMigrationManifest) => ({
        ...value,
        tables: [
          {
            ...value.tables[0],
            references: [{ ...value.tables[0].references[0], targetColumns: [] }],
          },
        ],
      }),
    ],
    [
      "json reference for another source column",
      (value: TenantMigrationManifest) => ({
        ...value,
        tables: [
          {
            ...value.tables[0],
            jsonColumns: [
              {
                ...value.tables[0].jsonColumns[0],
                references: [{ ...value.tables[0].jsonColumns[0].references![0], column: "wrong" }],
              },
            ],
          },
        ],
      }),
    ],
    [
      "supplemental json without classification",
      (value: TenantMigrationManifest) => ({
        ...value,
        supplementalTables: [
          { ...value.supplementalTables[0], jsonColumns: [{ column: "metadata" }] },
        ],
      }),
    ],
  ])("fails closed for %s manifest metadata", (_label, mutate) => {
    expect(() => validateManifest(mutate(manifest()) as TenantMigrationManifest)).toThrow();
  });

  it("reports schema drift across tenant and lifecycle-introduced tables", () => {
    const discovered = [
      ...columns().filter(
        ({ table_name, column_name }) =>
          table_name !== "sidecars" && column_name !== "id" && column_name !== "user_id"
      ),
      {
        table_schema: "public",
        table_name: "things",
        column_name: "unclassified_json",
        data_type: "jsonb",
        udt_name: "jsonb",
      },
      {
        table_schema: "public",
        table_name: "rogue",
        column_name: "id",
        data_type: "text",
        udt_name: "text",
      },
    ].map(
      ({
        table_schema: schema,
        table_name: table,
        column_name: column,
        data_type: dataType,
        udt_name: udtName,
      }) => ({ schema, table, column, dataType, udtName })
    );
    const failures = verifyDiscoveredSchema(manifest(), discovered, "after");
    expect(failures.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "UNCLASSIFIED_TABLE",
        "MISSING_CLASSIFIED_COLUMN",
        "MISSING_OWNER_COLUMN",
        "UNCLASSIFIED_JSON_COLUMN",
        "MISSING_SUPPLEMENTAL_TABLE",
      ])
    );
  });

  it("allows lifecycle supplemental tables to remain absent through expand", () => {
    const discovered = columns()
      .filter(({ table_name }) => table_name !== "sidecars")
      .map(
        ({
          table_schema: schema,
          table_name: table,
          column_name: column,
          data_type: dataType,
          udt_name: udtName,
        }) => ({ schema, table, column, dataType, udtName })
      );
    expect(verifyDiscoveredSchema(manifest(), discovered, "after", "expand")).toEqual([]);
  });

  it("builds a deterministic after report and surfaces data integrity failures", async () => {
    const clean = await buildTenantMigrationReport({
      client: reportClient() as never,
      ownerId,
      stage: "after",
      generatedAt: new Date("2026-09-08T00:00:00.000Z"),
      manifest: manifest(),
    });
    expect(clean.verification).toEqual({ passed: true, failures: [] });
    expect(clean.tables[0]).toMatchObject({
      rowCount: 2,
      queueState: [{ status: "pending", kind: null, count: 2 }],
    });

    const invalid = await buildTenantMigrationReport({
      client: reportClient(columns(), { orphan: "1", collision: "2", json: "3" }) as never,
      ownerId,
      stage: "after",
      manifest: manifest(),
    });
    expect(invalid.verification.failures.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "RELATIONAL_ORPHANS",
        "UNIQUENESS_COLLISIONS",
        "JSON_REFERENCE_ORPHANS",
      ])
    );
  });

  it("projects a read-only rehearsal when owner columns do not exist yet", async () => {
    const report = await buildTenantMigrationReport({
      client: reportClient(
        columns(false).filter(({ table_name }) => table_name !== "sidecars")
      ) as never,
      ownerId,
      stage: "rehearsal",
      through: "expand",
      manifest: manifest(),
    });
    expect(report.rehearsal).toMatchObject({
      readOnly: true,
      projectionPasses: 2,
      idempotent: true,
    });
    expect(report.rehearsal?.assignments[0]).toMatchObject({ firstPass: 2, secondPass: 0 });
  });

  it("rejects malformed query values and stops before data snapshots after schema drift", async () => {
    const malformed = reportClient();
    malformed.unsafe.mockImplementationOnce(async () => [{ table_schema: "public" }] as never);
    await expect(
      buildTenantMigrationReport({
        client: malformed as never,
        ownerId,
        stage: "before",
        manifest: manifest(),
      })
    ).rejects.toThrow("Query did not return string field table_name");

    const drift = reportClient([
      {
        table_schema: "public",
        table_name: "rogue",
        column_name: "id",
        data_type: "text",
        udt_name: "text",
      },
    ]);
    await expect(
      buildTenantMigrationReport({
        client: drift as never,
        ownerId,
        stage: "after",
        manifest: manifest(),
      })
    ).rejects.toMatchObject({ failures: expect.any(Array) });
    expect(drift.unsafe).toHaveBeenCalledTimes(1);
  });

  it("detects every immutable baseline/report comparison failure", async () => {
    const baseline = await buildTenantMigrationReport({
      client: reportClient() as never,
      ownerId,
      stage: "before",
      manifest: manifest(),
    });
    const after = { ...baseline, stage: "after" as const } as TenantMigrationReport;
    expect(verifyAfterAgainstBaseline(baseline, after)).toEqual([]);
    const failures = verifyAfterAgainstBaseline(
      { ...baseline, stage: "after" },
      {
        ...after,
        stage: "before",
        manifestHash: "changed",
        immutableOwner: { ...after.immutableOwner, userId: "22222222-2222-4222-8222-222222222222" },
        invariantFingerprint: "changed",
      }
    );
    expect(failures.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "INVALID_AFTER_REPORT",
        "INVALID_BASELINE_REPORT",
        "MANIFEST_CHANGED",
        "OWNER_CHANGED",
        "DATA_CHANGED",
      ])
    );
  });
});
