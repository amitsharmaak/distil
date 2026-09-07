import { resolve } from "node:path";
import { findTenantMigrationEvidence } from "../support/migration-invariants";

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
});
