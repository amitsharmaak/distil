import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "src/lib/postgres/tenant-migrations/0008_phase3_lifecycle.sql"),
  "utf8"
);

describe("Phase 3 lifecycle migration", () => {
  it("is additive and creates tenant-protected quota and OAuth state", () => {
    expect(migration).toContain(
      "ALTER TABLE account_exports ADD COLUMN IF NOT EXISTS idempotency_key"
    );
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS user_quotas");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS connector_oauth_states");
    expect(migration).toContain("ALTER TABLE user_quotas FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("CREATE OR REPLACE VIEW tenant_api.user_quotas");
  });

  it("keeps deletion proof and privileged audit outside runtime access", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS account_deletion_tombstones");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS operator_audit_events");
    expect(migration).toContain(
      "REVOKE ALL ON account_deletion_tombstones, operator_audit_events FROM PUBLIC, distil_runtime"
    );
  });

  it("invalidates capture tokens whose owning account is no longer active", () => {
    expect(migration).toContain("JOIN public.users AS account ON account.id = token.user_id");
    expect(migration).toContain("AND account.status = 'active'");
  });
});
