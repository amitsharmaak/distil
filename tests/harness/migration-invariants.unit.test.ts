import { resolve } from "node:path";
import { findTenantMigrationEvidence } from "../support/migration-invariants";

describe("tenant migration evidence", () => {
  it("requires tenant columns, RLS enablement, and a policy", () => {
    expect(
      findTenantMigrationEvidence(resolve(__dirname, "../fixtures/phase3/migrations"))
    ).toMatchObject({
      present: true,
      files: ["0001_tenant_probe.sql"],
      signals: {
        tenantColumn: true,
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
});
