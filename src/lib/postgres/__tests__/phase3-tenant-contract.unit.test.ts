import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const contract = readFileSync(
  resolve(process.cwd(), "src/lib/postgres/tenant-migrations/0007_phase3_tenant_contract.sql"),
  "utf8"
);

describe("Phase 3 tenant contract", () => {
  it("forces runtime repository SQL through tenant-filtered views", () => {
    expect(contract).toContain("CREATE SCHEMA tenant_api AUTHORIZATION distil_migration");
    expect(contract).toContain("WITH (security_barrier=true)");
    expect(contract).toContain("WITH CASCADED CHECK OPTION");
    expect(contract).toContain("user_id = nullif(current_setting(''app.user_id'', true)");
    expect(contract).toContain("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM distil_runtime");
  });

  it("refreshes migration-role privileges after expand before owning views and functions", () => {
    const grant = contract.indexOf(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO distil_migration"
    );
    const authFunction = contract.indexOf(
      "CREATE OR REPLACE FUNCTION distil_resolve_auth_identity"
    );
    const tenantSchema = contract.indexOf("CREATE SCHEMA tenant_api");
    expect(grant).toBeGreaterThan(-1);
    expect(grant).toBeLessThan(authFunction);
    expect(authFunction).toBeLessThan(tenantSchema);
  });
});
