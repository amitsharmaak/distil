import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import postgres, { type Sql } from "postgres";

import { CaptureProcessingError } from "@/lib/capture/errors";
import { CaptureService } from "@/lib/capture/service";
import { CaptureWorker } from "@/lib/capture/worker";
import { createAuthContext, createSystemContext } from "@/lib/contracts";
import {
  createCaptureQueueMessageV2,
  createTenantJobEnvelopeV1,
} from "@/lib/contracts/tenant-jobs";
import { consumeLifecycleTenantJobEnvelope } from "@/lib/lifecycle/queue-runtime";
import {
  cancelAccountDeletion,
  processAccountDeletion,
  requestAccountDeletion,
} from "@/lib/lifecycle/deletion";
import { FakeAuthAccountPurger } from "@/lib/lifecycle/fakes";
import { authProviderSubjectSchema } from "@/lib/lifecycle/ports";
import {
  processAccountExport,
  readAccountExportDownload,
  requestAccountExport,
} from "@/lib/lifecycle/exports";
import { FakeCaptureDispatcher, FakeTenantJobDispatcher } from "@/lib/queue/dispatchers";
import { FakeTenantObjectStore } from "@/lib/storage/fake-object-store";
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
  await applyTenantMigrationStage({
    sql: harness.sql,
    stage: "returning-auth",
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

it("resolves only an exact active returning-user email through the runtime role", async () => {
  await harness.sql`
    INSERT INTO auth_identities
      (id,user_id,provider,provider_subject,email,email_verified)
    VALUES
      ('50000000-0000-4000-8000-000000000081'::uuid,${alpha.userId}::uuid,
       'neon','alpha-provider-subject','alpha@example.com',true)`;
  const repository = new PostgresAuthRepository(runtimeSql);
  await expect(repository.findAccountByEmail("alpha@example.com")).resolves.toMatchObject({
    userId: alpha.userId,
    primaryEmail: "alpha@example.com",
    status: "active",
  });
  await expect(repository.findAccountByEmail("ALPHA@example.com")).resolves.toBeUndefined();
  await expect(repository.findAccountByEmail("missing@example.com")).resolves.toBeUndefined();

  await harness.sql`UPDATE users SET status='suspended' WHERE id=${alpha.userId}::uuid`;
  await expect(repository.findAccountByEmail("alpha@example.com")).resolves.toBeUndefined();
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
  await expect(alphaRepositories.lifecycle.listExports({ limit: 20 })).resolves.toEqual([
    expect.objectContaining({ id: ready.id, status: "ready", userId: alpha.userId }),
  ]);
  await expect(betaRepositories.lifecycle.listExports({ limit: 20 })).resolves.toEqual([]);
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

it("P3-RECOVERY-001: recovers durable export after queue and object-store outages", async () => {
  const access = createPostgresRepositoryAccess(runtimeSql);
  const alphaRepositories = access.getTenantRepositories(alpha);
  const betaRepositories = access.getTenantRepositories(beta);
  const dispatcher = new FakeTenantJobDispatcher();
  dispatcher.failure = new Error("injected lifecycle queue outage");

  await expect(
    requestAccountExport(alpha, alphaRepositories, {
      idempotencyKey: "wave4-export-recovery",
      now,
      dispatcher,
    })
  ).rejects.toThrow("injected lifecycle queue outage");

  dispatcher.failure = undefined;
  const replay = await requestAccountExport(alpha, alphaRepositories, {
    idempotencyKey: "wave4-export-recovery",
    now,
    dispatcher,
  });
  expect(replay.created).toBe(false);
  expect(dispatcher.messages).toHaveLength(2);

  const store = new FakeTenantObjectStore();
  const put = jest.spyOn(store, "put");
  store.failNext("put");
  const exportEnvelope = dispatcher.messages.find(
    ({ message }) => message.jobType === "account.export"
  )!.message;
  const consume = (envelope = exportEnvelope) =>
    consumeLifecycleTenantJobEnvelope(envelope, {
      getTenantRepositories: async (context) => access.getTenantRepositories(context),
      getObjectStore: () => store,
    });
  await expect(consume()).resolves.toBe("failed");
  await expect(alphaRepositories.lifecycle.findExport(replay.export.id)).resolves.toMatchObject({
    status: "failed",
    failureCode: "EXPORT_GENERATION_FAILED",
  });

  await expect(consume()).resolves.toBe("completed");
  const ready = await alphaRepositories.lifecycle.findExport(replay.export.id);
  expect(ready).toMatchObject({ status: "ready" });
  await expect(consume()).resolves.toBe("rejected");
  await expect(
    consume(
      createTenantJobEnvelopeV1({
        userId: beta.userId,
        jobId: exportEnvelope.jobId,
        jobType: exportEnvelope.jobType,
        traceId: beta.requestId,
      })
    )
  ).resolves.toBe("rejected");
  expect(put).toHaveBeenCalledTimes(2);
  await expect(store.list(alpha)).resolves.toHaveLength(1);
  await expect(store.list(beta)).resolves.toEqual([]);
  await expect(betaRepositories.lifecycle.findExport(replay.export.id)).resolves.toBeUndefined();

  const [jobs, usage] = await Promise.all([
    harness.sql<Array<{ count: number }>>`
      SELECT count(*)::integer AS count FROM job_queue
      WHERE user_id=${alpha.userId}::uuid
        AND job_type IN ('account.export','account.export-expire')`,
    harness.sql<Array<{ request_count: number }>>`
      SELECT request_count FROM usage_counters
      WHERE user_id=${alpha.userId}::uuid AND operation='account.exports'`,
  ]);
  expect(jobs[0]?.count).toBe(2);
  expect(usage[0]?.request_count).toBe(1);
});

it("P3-RECOVERY-002: retries one durable capture after queue publication fails", async () => {
  const access = createPostgresRepositoryAccess(runtimeSql);
  const alphaRepositories = access.getTenantRepositories(alpha);
  const betaRepositories = access.getTenantRepositories(beta);
  const dispatcher = new FakeCaptureDispatcher();
  dispatcher.failure = new Error("injected capture queue outage");
  const captureId = "50000000-0000-4000-8000-000000000084";
  const service = new CaptureService({
    context: alpha,
    captures: alphaRepositories.captures,
    dispatcher,
    resolve: async () => [{ address: "93.184.216.34", family: 4 }],
    id: () => captureId,
    now: () => now,
  });
  const input = {
    url: "https://wave4.example/recovery",
    source: "web" as const,
  };

  await expect(service.create(input)).rejects.toMatchObject({
    name: "QueueUnavailableError",
    receipt: { id: captureId, status: "failed", retryable: true },
  });
  dispatcher.failure = undefined;
  await expect(service.retry(captureId)).resolves.toMatchObject({
    id: captureId,
    status: "queued",
    retryable: true,
  });
  await expect(service.create(input)).resolves.toMatchObject({
    duplicate: true,
    receipt: { id: captureId, status: "queued" },
  });
  expect(dispatcher.messages).toHaveLength(1);

  const processor = jest
    .fn()
    .mockRejectedValueOnce(new CaptureProcessingError("UPSTREAM_503", "busy", "transient"))
    .mockResolvedValue({ status: "ready" });
  const audit = jest.fn();
  const worker = new CaptureWorker({
    context: alpha,
    captures: alphaRepositories.captures,
    processor,
    audit,
    now: () => now,
  });
  await expect(worker.handle(dispatcher.messages[0]!.message)).rejects.toMatchObject({
    name: "CaptureRetryScheduledError",
  });
  await expect(worker.handle(dispatcher.messages[0]!.message)).resolves.toMatchObject({
    id: captureId,
    status: "ready",
    attempts: 2,
  });
  await expect(worker.handle(dispatcher.messages[0]!.message)).resolves.toMatchObject({
    status: "ready",
    attempts: 2,
  });
  expect(processor).toHaveBeenCalledTimes(2);
  await expect(
    worker.handle(
      createCaptureQueueMessageV2({
        userId: beta.userId,
        captureId,
        traceId: beta.requestId,
      })
    )
  ).resolves.toBeUndefined();
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({ action: "capture_queue_owner_mismatch_or_missing" })
  );

  const betaService = new CaptureService({
    context: beta,
    captures: betaRepositories.captures,
    dispatcher: new FakeCaptureDispatcher(),
  });
  await expect(betaService.get(captureId)).rejects.toMatchObject({ name: "CaptureNotFoundError" });
  const [count] = await harness.sql<Array<{ count: number }>>`
    SELECT count(*)::integer AS count FROM capture_requests WHERE id=${captureId}`;
  expect(count?.count).toBe(1);
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

it("checkpoints the external auth subject before purge so failed work can retry", async () => {
  const access = createPostgresRepositoryAccess(runtimeSql, harness.sql);
  const repositories = access.getTenantRepositories(alpha);
  const control = (await access.getControlPlaneRepositories(system)).lifecycle;
  const providerSubject = authProviderSubjectSchema.parse("neon-retry-subject-alpha");
  await harness.sql`
    INSERT INTO auth_identities (id,user_id,provider,provider_subject,email,email_verified)
    VALUES ('61000000-0000-4000-8000-000000000081'::uuid,${alpha.userId}::uuid,'neon',
      ${providerSubject},'alpha@example.com',true)`;
  const requested = await requestAccountDeletion(alpha, repositories, {
    confirmation: "DELETE MY ACCOUNT",
    now,
  });
  const purgeAt = new Date(requested.deletion.purgeAfter).toISOString();

  await expect(
    control.findDeletionWork(requested.deletion.id, alpha.userId)
  ).resolves.toMatchObject({ authProviderSubject: providerSubject });
  await expect(
    control.markDeletionPurging(requested.deletion.id, alpha.userId, providerSubject, purgeAt)
  ).resolves.toBe(true);
  await harness.sql`DELETE FROM auth_identities WHERE user_id=${alpha.userId}::uuid`;
  await control.failDeletion(requested.deletion.id, alpha.userId, "PURGE_FAILED", purgeAt);

  await expect(
    control.findDeletionWork(requested.deletion.id, alpha.userId)
  ).resolves.toMatchObject({
    status: "failed",
    authProviderSubject: providerSubject,
    checkpoint: { neonAuthSubject: providerSubject },
  });
});

it("P3-RECOVERY-003: resumes deletion after provider outage and terminal replay", async () => {
  const access = createPostgresRepositoryAccess(runtimeSql, harness.sql);
  const repositories = access.getTenantRepositories(alpha);
  const control = (await access.getControlPlaneRepositories(system)).lifecycle;
  const store = new FakeTenantObjectStore();
  const authPurger = new FakeAuthAccountPurger();
  const providerSubject = authProviderSubjectSchema.parse("neon-wave4-recovery-alpha");
  await harness.sql`
    INSERT INTO auth_identities (id,user_id,provider,provider_subject,email,email_verified)
    VALUES ('61000000-0000-4000-8000-000000000084'::uuid,${alpha.userId}::uuid,'neon',
      ${providerSubject},'alpha@example.com',true)`;
  await store.put(
    alpha,
    {
      objectType: "raw-content",
      objectId: "51000000-0000-4000-8000-000000000084",
      version: 1,
    },
    new TextEncoder().encode("wave4 private content"),
    { contentType: "text/plain", createdAt: now.toISOString() }
  );
  const requested = await requestAccountDeletion(alpha, repositories, {
    confirmation: "DELETE MY ACCOUNT",
    now,
  });
  const purgeAt = new Date(requested.deletion.purgeAfter);
  const dependencies = {
    objectStore: store,
    authPurger,
    getControlPlaneLifecycle: async () => control,
    systemContext: system,
  };

  authPurger.fail = true;
  await expect(
    processAccountDeletion(alpha, repositories, dependencies, {
      deletionId: requested.deletion.id,
      now: purgeAt,
    })
  ).rejects.toThrow("Injected auth purge failure");
  await expect(
    control.findDeletionWork(requested.deletion.id, alpha.userId)
  ).resolves.toMatchObject({
    status: "failed",
    checkpoint: { neonAuthSubject: providerSubject },
  });
  await expect(store.list(alpha)).resolves.toEqual([]);

  authPurger.fail = false;
  const completed = await processAccountDeletion(alpha, repositories, dependencies, {
    deletionId: requested.deletion.id,
    now: purgeAt,
  });
  await expect(
    processAccountDeletion(alpha, repositories, dependencies, {
      deletionId: requested.deletion.id,
      now: purgeAt,
    })
  ).resolves.toEqual(completed);
  expect(authPurger.revoked).toEqual([providerSubject]);
  expect(authPurger.deleted).toEqual([providerSubject]);
  const [betaAccount] = await harness.sql<Array<{ status: string }>>`
    SELECT status FROM users WHERE id=${beta.userId}::uuid`;
  expect(betaAccount?.status).toBe("active");
});

it("purges tenant rows, objects, and provider identity before writing a content-free tombstone", async () => {
  const access = createPostgresRepositoryAccess(runtimeSql, harness.sql);
  const repositories = access.getTenantRepositories(alpha);
  const store = new FakeTenantObjectStore();
  const providerSubject = authProviderSubjectSchema.parse("neon-auth-subject-alpha");
  await harness.sql`
    INSERT INTO auth_identities (id,user_id,provider,provider_subject,email,email_verified)
    VALUES ('60000000-0000-4000-8000-000000000081'::uuid,${alpha.userId}::uuid,'neon',
      ${providerSubject},'alpha@example.com',true)`;
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
  expect(authPurger.revoked).toEqual([providerSubject]);
  expect(authPurger.deleted).toEqual([providerSubject]);
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
  expect(authPurger.revoked).toEqual([providerSubject]);
  expect(authPurger.deleted).toEqual([providerSubject]);
});

it("atomically admits one concurrent invitation dispatch and safely releases bounded retries", async () => {
  const invitationId = "60000000-0000-4000-8000-000000000081";
  const claimedAt = new Date("2026-09-08T09:00:00.000Z");
  await harness.sql`
    INSERT INTO invitations
      (id,normalized_email,email_hash,token_salt,token_hash,issued_by_actor_id,
       issuance_reason,status,expires_at,created_at)
    VALUES
      (${invitationId}::uuid,'invite@example.com','email-hash','salt','token-hash',
       ${system.actorId}::uuid,'concurrency test','pending',
       statement_timestamp() + interval '1 day',
       ${claimedAt.toISOString()}::timestamptz)`;
  const repository = new PostgresAuthRepository(runtimeSql);
  const claimIds = Array.from(
    { length: 12 },
    (_, index) => `70000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
  );
  await expect(
    repository.claimInvitationDispatch({
      invitationId,
      tokenHash: "wrong-token-hash",
      emailHash: "email-hash",
      claimId: "70000000-0000-4000-8000-999999999999",
    })
  ).resolves.toBe(false);
  const claims = await Promise.all(
    claimIds.map(async (claimId) => ({
      claimId,
      claimed: await repository.claimInvitationDispatch({
        invitationId,
        tokenHash: "token-hash",
        emailHash: "email-hash",
        claimId,
      }),
    }))
  );
  const winner = claims.filter(({ claimed }) => claimed);
  expect(winner).toHaveLength(1);
  const [claimedRow] = await harness.sql<
    Array<{ dispatch_attempts: number; dispatch_claim_id: string }>
  >`
    SELECT dispatch_attempts,dispatch_claim_id::text
    FROM invitations WHERE id=${invitationId}::uuid`;
  expect(claimedRow).toEqual({ dispatch_attempts: 1, dispatch_claim_id: winner[0]?.claimId });

  await expect(
    repository.completeInvitationDispatch({
      invitationId,
      claimId: winner[0]!.claimId,
    })
  ).resolves.toBe(true);
  await expect(
    repository.claimInvitationDispatch({
      invitationId,
      tokenHash: "token-hash",
      emailHash: "email-hash",
      claimId: claimIds[1]!,
    })
  ).resolves.toBe(false);

  const retryClaimId = "70000000-0000-4000-8000-888888888888";
  await harness.sql`
    UPDATE invitations SET dispatch_retry_after=statement_timestamp() - interval '1 second'
    WHERE id=${invitationId}::uuid`;
  await expect(
    repository.claimInvitationDispatch({
      invitationId,
      tokenHash: "token-hash",
      emailHash: "email-hash",
      claimId: retryClaimId,
    })
  ).resolves.toBe(true);
  await expect(
    repository.failInvitationDispatch({
      invitationId,
      claimId: retryClaimId,
    })
  ).resolves.toBe(true);
  await expect(
    repository.claimInvitationDispatch({
      invitationId,
      tokenHash: "token-hash",
      emailHash: "email-hash",
      claimId: "70000000-0000-4000-8000-777777777777",
    })
  ).resolves.toBe(false);
  const [failedRow] = await harness.sql<Array<{ retry_seconds: number }>>`
    SELECT extract(epoch FROM (dispatch_retry_after - statement_timestamp()))::float8 AS retry_seconds
    FROM invitations WHERE id=${invitationId}::uuid`;
  expect(failedRow!.retry_seconds).toBeGreaterThan(8);
  expect(failedRow!.retry_seconds).toBeLessThanOrEqual(10);
  await harness.sql`
    UPDATE invitations SET dispatch_retry_after=statement_timestamp() - interval '1 second'
    WHERE id=${invitationId}::uuid`;
  const cappedClaimId = "70000000-0000-4000-8000-666666666666";
  await expect(
    repository.claimInvitationDispatch({
      invitationId,
      tokenHash: "token-hash",
      emailHash: "email-hash",
      claimId: cappedClaimId,
    })
  ).resolves.toBe(true);
  await harness.sql`
    UPDATE invitations SET dispatch_attempts=100 WHERE id=${invitationId}::uuid`;
  await expect(
    repository.failInvitationDispatch({ invitationId, claimId: cappedClaimId })
  ).resolves.toBe(true);
  const [cappedRow] = await harness.sql<Array<{ retry_seconds: number }>>`
    SELECT extract(epoch FROM (dispatch_retry_after - statement_timestamp()))::float8 AS retry_seconds
    FROM invitations WHERE id=${invitationId}::uuid`;
  expect(cappedRow!.retry_seconds).toBeGreaterThan(298);
  expect(cappedRow!.retry_seconds).toBeLessThanOrEqual(300);
});
