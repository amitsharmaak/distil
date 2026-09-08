import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import postgres, { type Sql } from "postgres";

import { createAuthContext, createSystemContext } from "@/lib/contracts";
import {
  cancelAccountDeletion,
  processAccountDeletion,
  requestAccountDeletion,
} from "@/lib/lifecycle/deletion";
import { FakeAuthAccountPurger } from "@/lib/lifecycle/fakes";
import {
  processAccountExport,
  readAccountExportDownload,
  requestAccountExport,
} from "@/lib/lifecycle/exports";
import { FakeTenantObjectStore } from "@/lib/storage/fake-object-store";
import { PostgresTestHarness } from "../../../../tests/support/postgres";
import { applyTenantMigrationStage } from "../tenant-migration/migrator";
import { buildTenantMigrationReport } from "../tenant-migration/verifier";
import { createPostgresRepositoryAccess } from "../tenant-repositories";

jest.setTimeout(120_000);

const harness = new PostgresTestHarness();
const migrations = resolve(process.cwd(), "src/lib/postgres/migrations");
const tenantMigrations = resolve(process.cwd(), "src/lib/postgres/tenant-migrations");
const rolesSql = resolve(process.cwd(), "src/lib/postgres/roles/phase3_roles.sql");
const runtimeRole = "distil_lifecycle_test_app";
const runtimePassword = "distil_lifecycle_test_password";
const now = new Date("2026-09-08T06:00:00.000Z");

const alpha = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000081",
  actorKind: "user",
  actorId: "10000000-0000-4000-8000-000000000081",
  requestId: "30000000-0000-4000-8000-000000000081",
});
const beta = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000082",
  actorKind: "user",
  actorId: "10000000-0000-4000-8000-000000000082",
  requestId: "30000000-0000-4000-8000-000000000082",
});
const system = createSystemContext({
  actorKind: "system",
  actorId: "20000000-0000-4000-8000-000000000081",
  requestId: "40000000-0000-4000-8000-000000000081",
});

let runtimeSql: Sql;

beforeAll(async () => {
  await harness.start();
  await harness.migrate(migrations);
  await harness.sql.unsafe("DROP TABLE __distil_test_migrations");
  await harness.sql.unsafe(await readFile(rolesSql, "utf8"));
  await applyTenantMigrationStage({
    sql: harness.sql,
    stage: "expand",
    ownerId: alpha.userId,
    migrationsDirectory: tenantMigrations,
  });
  const baseline = await buildTenantMigrationReport({
    client: harness.sql,
    stage: "before",
    ownerId: alpha.userId,
  });
  await applyTenantMigrationStage({
    sql: harness.sql,
    stage: "backfill",
    ownerId: alpha.userId,
    migrationsDirectory: tenantMigrations,
  });
  await applyTenantMigrationStage({
    sql: harness.sql,
    stage: "contract",
    ownerId: alpha.userId,
    migrationsDirectory: tenantMigrations,
    baseline,
  });
  await applyTenantMigrationStage({
    sql: harness.sql,
    stage: "lifecycle",
    ownerId: alpha.userId,
    migrationsDirectory: tenantMigrations,
  });
  await harness.sql.unsafe(`
    CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS;
    GRANT distil_runtime TO ${runtimeRole};
  `);
  const runtimeUri = new URL(harness.connectionUri);
  runtimeUri.username = runtimeRole;
  runtimeUri.password = runtimePassword;
  runtimeSql = postgres(runtimeUri.toString(), {
    max: 4,
    prepare: false,
    onnotice: () => undefined,
  });
});

beforeEach(async () => {
  await harness.reset();
  await harness.sql`
    INSERT INTO users (id,status,primary_email)
    VALUES (${alpha.userId}::uuid,'active','alpha@example.com'),
           (${beta.userId}::uuid,'active','beta@example.com')`;
});

afterAll(async () => {
  await runtimeSql.end({ timeout: 5 });
  await harness.stop();
});

it("creates one idempotent export, produces an owner-only archive, and enforces quota atomically", async () => {
  const access = createPostgresRepositoryAccess(runtimeSql);
  const alphaRepositories = access.getTenantRepositories(alpha);
  const betaRepositories = access.getTenantRepositories(beta);
  const first = await requestAccountExport(alpha, alphaRepositories, {
    idempotencyKey: "lifecycle-export-1",
    now,
  });
  const replay = await requestAccountExport(alpha, alphaRepositories, {
    idempotencyKey: "lifecycle-export-1",
    now,
  });
  expect(first.created).toBe(true);
  expect(replay).toMatchObject({ created: false, jobId: first.export.id });

  const store = new FakeTenantObjectStore();
  const ready = await processAccountExport(alpha, alphaRepositories, store, {
    exportId: first.export.id,
    jobId: first.jobId,
    now,
  });
  expect(ready.status).toBe("ready");
  await expect(
    readAccountExportDownload(alpha, alphaRepositories, store, ready.id, now)
  ).resolves.toMatchObject({
    record: { id: ready.id },
    object: { contentType: "application/zip" },
  });
  await expect(betaRepositories.lifecycle.findExport(ready.id)).resolves.toBeUndefined();
  await expect(store.list(beta)).resolves.toEqual([]);

  await harness.sql`
    INSERT INTO user_quotas (user_id,quota_key,period,hard_limit,updated_by_actor_id)
    VALUES (${alpha.userId}::uuid,'test.requests','day',2,${alpha.actorId}::uuid)`;
  const reservations = await Promise.all(
    Array.from({ length: 3 }, () =>
      alphaRepositories.lifecycle.consumeUsage({
        date: "2026-09-08",
        operation: "test.requests",
        requestCount: 1,
      })
    )
  );
  expect(reservations.filter(({ allowed }) => allowed)).toHaveLength(2);
  expect(reservations.filter(({ allowed }) => !allowed)).toHaveLength(1);
});

it("revokes queued work immediately and restores active status on grace-period cancellation", async () => {
  const repositories = createPostgresRepositoryAccess(runtimeSql).getTenantRepositories(alpha);
  const result = await requestAccountDeletion(alpha, repositories, {
    confirmation: "DELETE MY ACCOUNT",
    now,
  });
  expect(result.deletion).toMatchObject({ status: "requested" });
  await expect(repositories.jobs.isCancellationRequested(result.jobId)).resolves.toBe(false);
  const [pending] = await harness.sql<Array<{ status: string }>>`
    SELECT status FROM users WHERE id=${alpha.userId}::uuid`;
  expect(pending?.status).toBe("deletion_pending");

  const cancelled = await cancelAccountDeletion(alpha, repositories, {
    now: new Date(now.getTime() + 60_000),
  });
  expect(cancelled.status).toBe("cancelled");
  await expect(repositories.jobs.isCancellationRequested(result.jobId)).resolves.toBe(true);
  const [active] = await harness.sql<Array<{ status: string }>>`
    SELECT status FROM users WHERE id=${alpha.userId}::uuid`;
  expect(active?.status).toBe("active");
});

it("purges tenant rows, objects, and provider identity before writing a content-free tombstone", async () => {
  const access = createPostgresRepositoryAccess(runtimeSql, harness.sql);
  const repositories = access.getTenantRepositories(alpha);
  const store = new FakeTenantObjectStore();
  await store.put(
    alpha,
    {
      objectType: "raw-content",
      objectId: "50000000-0000-4000-8000-000000000081",
      version: 1,
    },
    new TextEncoder().encode("private content"),
    { contentType: "text/plain", createdAt: now.toISOString() }
  );
  const requested = await requestAccountDeletion(alpha, repositories, {
    confirmation: "DELETE MY ACCOUNT",
    now,
  });
  const authPurger = new FakeAuthAccountPurger();
  const outcome = await processAccountDeletion(
    alpha,
    repositories,
    {
      objectStore: store,
      authPurger,
      getControlPlaneLifecycle: async (context) =>
        (await access.getControlPlaneRepositories(context)).lifecycle,
      systemContext: system,
    },
    {
      deletionId: requested.deletion.id,
      now: new Date(requested.deletion.purgeAfter),
    }
  );

  expect(outcome).toMatchObject({
    status: "completed",
    verification: { zeroRowCount: 0, zeroObjectCount: 0, authPurged: true },
  });
  expect(authPurger.revoked).toEqual([alpha.userId]);
  expect(authPurger.deleted).toEqual([alpha.userId]);
  await expect(store.list(alpha)).resolves.toEqual([]);
  const [rows, tombstones, audits] = await Promise.all([
    harness.sql<Array<{ count: number }>>`
      SELECT count(*)::integer AS count FROM users WHERE id=${alpha.userId}::uuid`,
    harness.sql<Array<{ count: number }>>`
      SELECT count(*)::integer AS count FROM account_deletion_tombstones
      WHERE deletion_id=${requested.deletion.id}::uuid`,
    harness.sql<Array<{ count: number }>>`
      SELECT count(*)::integer AS count FROM operator_audit_events WHERE action='account.delete'`,
  ]);
  expect(rows[0]?.count).toBe(0);
  expect(tombstones[0]?.count).toBe(1);
  expect(audits[0]?.count).toBe(1);

  await expect(
    processAccountDeletion(
      alpha,
      repositories,
      {
        objectStore: store,
        authPurger,
        getControlPlaneLifecycle: async (context) =>
          (await access.getControlPlaneRepositories(context)).lifecycle,
        systemContext: system,
      },
      { deletionId: requested.deletion.id, now: new Date(requested.deletion.purgeAfter) }
    )
  ).resolves.toMatchObject({ status: "completed", verification: outcome.verification });
  expect(authPurger.revoked).toEqual([alpha.userId]);
  expect(authPurger.deleted).toEqual([alpha.userId]);
});
