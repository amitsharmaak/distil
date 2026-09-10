import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "src/lib/postgres/tenant-migrations/0009_phase3_returning_auth.sql"),
  "utf8"
);

describe("Phase 3 returning-auth migration", () => {
  it("exposes only an exact active-email lookup to the runtime role", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION distil_resolve_active_auth_email");
    expect(migration).toContain("account.primary_email = requested_email");
    expect(migration).toContain("account.status = 'active'");
    expect(migration).toContain("identity.provider = 'neon'");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION distil_resolve_active_auth_email(text) TO distil_runtime"
    );
    expect(migration).not.toContain("GRANT SELECT ON users");
  });
});
