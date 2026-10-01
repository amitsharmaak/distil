import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import postgres, { type Sql } from "postgres";

import { executeInvitationCommand } from "@/lib/auth/invitations";
import { createSystemContext } from "@/lib/contracts";
import { PostgresTestHarness } from "../../../../tests/support/postgres";
import { PostgresAuthRepository } from "../auth-repository";
import { applyTenantMigrationStage } from "../tenant-migration/migrator";
import { buildTenantMigrationReport } from "../tenant-migration/verifier";
import { createPostgresRepositoryAccess } from "../tenant-repositories";

jest.setTimeout(120_000);

const harness = new PostgresTestHarness();
const migrations = resolve(process.cwd(), "src/lib/postgres/migrations");
const tenantMigrations = resolve(process.cwd(), "src/lib/postgres/tenant-migrations");
const rolesSql = resolve(process.cwd(), "src/lib/postgres/roles/phase3_roles.sql");
const runtimeRole = "distil_admin_invites_test_app";
const runtimePassword = "distil_admin_invites_test_password";

const adminId = "10000000-0000-4000-8000-000000000091";
const system = createSystemContext({
  actorKind: "system",
  actorId: "00000000-0000-4000-8000-000000000006",
  requestId: "40000000-0000-4000-8000-000000000091",
});

let runtimeSql: Sql;

beforeAll(async () => {
  await harness.start();
  await harness.migrate(migrations);
  await harness.sql.unsafe("DROP TABLE __distil_test_migrations");
  await harness.sql.unsafe(await readFile(rolesSql, "utf8"));
  const common = { sql: harness.sql, ownerId: adminId, migrationsDirectory: tenantMigrations };
  await applyTenantMigrationStage({ ...common, stage: "expand" });
  const baseline = await buildTenantMigrationReport({
    client: harness.sql,
    stage: "before",
    ownerId: adminId,
  });
  await applyTenantMigrationStage({ ...common, stage: "backfill" });
  await applyTenantMigrationStage({ ...common, stage: "contract", baseline });
  for (const stage of [
    "lifecycle",
    "returning-auth",
    "perf-indexes",
    "summary-structure",
    "feed-search",
    "life-areas",
  ] as const) {
    await applyTenantMigrationStage({ ...common, stage });
  }
  await harness.sql.unsafe(`
    CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS;
    GRANT distil_runtime TO ${runtimeRole};
  `);
  const runtimeUri = new URL(harness.connectionUri);
  runtimeUri.username = runtimeRole;
  runtimeUri.password = runtimePassword;
  runtimeSql = postgres(runtimeUri.toString(), {
    max: 2,
    prepare: false,
    onnotice: () => undefined,
  });
});

beforeEach(async () => {
  await harness.reset();
  await harness.sql`
    INSERT INTO users (id,status,primary_email) VALUES (${adminId}::uuid,'active','admin@example.com')`;
});

afterAll(async () => {
  await runtimeSql.end({ timeout: 5 });
  await harness.stop();
});

it("issues, lists and revokes on the control-plane client while the runtime role is locked out", async () => {
  const access = createPostgresRepositoryAccess(runtimeSql, harness.sql);
  const control = access.getControlPlaneRepositories(system);

  const issued = await executeInvitationCommand(
    {
      action: "issue",
      email: "Colleague@Example.com",
      issuedByActorId: adminId,
      reason: "settings:invited from Settings",
      appOrigin: "https://distil.example",
    },
    control.auth
  );
  const other = await executeInvitationCommand(
    {
      action: "issue",
      email: "second@example.com",
      issuedByActorId: adminId,
      reason: "settings:second",
      appOrigin: "https://distil.example",
    },
    control.auth
  );

  const listed = await control.auth.listInvitations(10);
  expect(listed.map((row) => row.id)).toEqual([other.invitationId, issued.invitationId]);
  expect(listed[1]).toMatchObject({
    normalizedEmail: "colleague@example.com",
    status: "pending",
    issuedByActorId: adminId,
    issuanceReason: "settings:invited from Settings",
  });
  for (const row of listed) {
    expect(Object.keys(row)).not.toEqual(
      expect.arrayContaining(["tokenHash", "tokenSalt", "emailHash"])
    );
  }
  expect(await control.auth.listInvitations(1)).toHaveLength(1);

  await expect(
    executeInvitationCommand(
      {
        action: "revoke",
        invitationId: issued.invitationId,
        revokedByActorId: adminId,
        reason: "settings:wrong address",
      },
      control.auth
    )
  ).resolves.toMatchObject({ revoked: true });
  const afterRevoke = await control.auth.listInvitations(10);
  expect(afterRevoke.find((row) => row.id === issued.invitationId)).toMatchObject({
    status: "revoked",
    revokedByActorId: adminId,
  });

  await control.lifecycle.audit({
    id: "50000000-0000-4000-8000-000000000091",
    actorId: adminId,
    action: "invitation.issue",
    targetUserId: other.invitationId as never,
    reason: "settings:second",
    requestId: system.requestId,
    outcome: "succeeded",
    at: new Date().toISOString(),
  });
  const audits = await harness.sql<{ action: string; target_user_hash: string }[]>`
    SELECT action, target_user_hash FROM operator_audit_events`;
  expect(audits).toHaveLength(1);
  expect(audits[0].action).toBe("invitation.issue");

  // The runtime role can neither list nor write invitations directly.
  const runtimeAuth = new PostgresAuthRepository(runtimeSql);
  await expect(runtimeAuth.listInvitations(10)).rejects.toThrow(/permission denied/i);
});
