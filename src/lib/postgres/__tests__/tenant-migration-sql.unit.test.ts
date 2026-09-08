import { tenantMigrationManifest } from "../tenant-migration/manifest";
import {
  buildJsonReferenceSql,
  buildOwnershipSql,
  buildSchemaDiscoverySql,
  buildStableChecksumSql,
  buildUniquenessSql,
  quoteIdentifier,
} from "../tenant-migration/sql";

describe("tenant migration verification SQL", () => {
  const items = tenantMigrationManifest.tables.find((table) => table.table === "items")!;

  it("quotes only validated identifiers", () => {
    expect(quoteIdentifier("capture_requests")).toBe('"capture_requests"');
    expect(() => quoteIdentifier('items"; DROP TABLE items; --')).toThrow("Invalid identifier");
  });

  it("discovers only declared application schemas and base tables", () => {
    const query = buildSchemaDiscoverySql(["public"]);
    expect(query).toContain("t.table_type = 'BASE TABLE'");
    expect(query).toContain("c.table_schema IN ('public')");
  });

  it("excludes only declared migration columns from stable row checksums", () => {
    const query = buildStableChecksumSql(items);
    expect(query).toContain("to_jsonb(tenant_row) - ARRAY['user_id']");
    expect(query).toContain("ORDER BY identity_key");
    expect(query).not.toMatch(/UPDATE|ALTER|DELETE|INSERT/);
  });

  it("binds ownership checks to the explicitly validated UUID", () => {
    const query = buildOwnershipSql(items, "123e4567-e89b-42d3-a456-426614174000");
    expect(query).toContain("'123e4567-e89b-42d3-a456-426614174000'::uuid");
    expect(query).toContain('"user_id" IS NULL');
  });

  it("builds projected uniqueness and JSON orphan checks", () => {
    const uniqueness = buildUniquenessSql(items, items.uniqueness[0]);
    expect(uniqueness).toContain("HAVING count(*) > 1");
    expect(uniqueness).toContain("normalized_url IS NOT NULL");

    const suggestions = tenantMigrationManifest.tables.find(
      (table) => table.table === "research_suggestions"
    )!;
    const reference = suggestions.jsonColumns[0].references![0];
    const json = buildJsonReferenceSql(suggestions, reference);
    expect(json).toContain("jsonb_path_query");
    expect(json).toContain("'$[*]'::jsonpath");
    expect(json).toContain('LEFT JOIN "public"."items"');
  });
});
