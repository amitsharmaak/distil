import { createHash } from "node:crypto";

import type { UserId } from "@/lib/contracts";
import { authProviderSubjectSchema } from "@/lib/lifecycle/ports";
import { PostgresControlPlaneLifecycleRepository } from "@/lib/postgres/lifecycle-repositories";
import { tenantProtectedTables } from "@/lib/postgres/tenant-migration/manifest";

import { createLifecycleSqlDouble } from "./lifecycle-sql-double";

const userId = "10000000-0000-4000-8000-000000000010" as UserId;
const otherUserId = "11000000-0000-4000-8000-000000000011" as UserId;
const deletionId = "20000000-0000-4000-8000-000000000020";
const actorId = "30000000-0000-4000-8000-000000000030";
const requestId = "40000000-0000-4000-8000-000000000040";
const auditId = "50000000-0000-4000-8000-000000000050";
const at = "2026-09-08T12:00:00.000Z";
const providerSubject = authProviderSubjectSchema.parse("neon-auth-subject-10");

function deletionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: deletionId,
    user_id: userId,
    status: "purging",
    checkpoint: {},
    requested_at: "2026-09-01T00:00:00.000Z",
    purge_after: "2026-09-08T00:00:00.000Z",
    updated_at: at,
    started_at: at,
    auth_provider_subject: providerSubject,
    ...overrides,
  };
}

function tombstoneRow(overrides: Record<string, unknown> = {}) {
  return {
    deletion_id: deletionId,
    zero_row_count: "0",
    zero_object_count: 0,
    auth_purged: true,
    verification_hash: "verified-hash",
    ...overrides,
  };
}

function completionInput(overrides: Record<string, unknown> = {}) {
  return {
    deletionId,
    userId,
    completedAt: at,
    zeroObjectCount: 0,
    authPurged: true,
    actorId,
    requestId,
    ...overrides,
  };
}

describe("PostgresControlPlaneLifecycleRepository", () => {
  it("maps tombstones and conceals absent verification", async () => {
    const database = createLifecycleSqlDouble();
    database.respond([], [tombstoneRow()]);
    const repository = new PostgresControlPlaneLifecycleRepository(database.sql);

    await expect(repository.findDeletionVerification(deletionId)).resolves.toBeUndefined();
    await expect(repository.findDeletionVerification(deletionId)).resolves.toEqual({
      deletionId,
      zeroRowCount: 0,
      zeroObjectCount: 0,
      authPurged: true,
      verificationHash: "verified-hash",
    });
    database.assertExhausted();
  });

  it("binds deletion lookup and purge CAS to both deletion and owner", async () => {
    const database = createLifecycleSqlDouble();
    database.respond([], [deletionRow()], [], [{ id: deletionId }], []);
    const repository = new PostgresControlPlaneLifecycleRepository(database.sql);

    await expect(repository.findDeletionWork(deletionId, otherUserId)).resolves.toBeUndefined();
    await expect(repository.findDeletionWork(deletionId, userId)).resolves.toMatchObject({
      id: deletionId,
      userId,
      status: "purging",
      authProviderSubject: providerSubject,
    });
    await expect(
      repository.markDeletionPurging(deletionId, otherUserId, providerSubject, at)
    ).resolves.toBe(false);
    await expect(
      repository.markDeletionPurging(deletionId, userId, providerSubject, at)
    ).resolves.toBe(true);
    await repository.failDeletion(deletionId, userId, "PURGE_FAILED", at);

    expect(database.queries[0].values).toEqual([deletionId, otherUserId]);
    expect(database.queries[2].values).toEqual([
      providerSubject,
      at,
      at,
      deletionId,
      otherUserId,
      at,
    ]);
    expect(database.queries[4].values).toEqual(["PURGE_FAILED", at, deletionId, userId]);
    database.assertExhausted();
  });

  it("prefers the durable deletion checkpoint over a missing provider identity on retry", async () => {
    const database = createLifecycleSqlDouble();
    database.respond([
      deletionRow({
        checkpoint: { neonAuthSubject: providerSubject },
        auth_provider_subject: providerSubject,
      }),
    ]);
    const repository = new PostgresControlPlaneLifecycleRepository(database.sql);

    await expect(repository.findDeletionWork(deletionId, userId)).resolves.toMatchObject({
      authProviderSubject: providerSubject,
      checkpoint: { neonAuthSubject: providerSubject },
    });
    expect(database.queries[0].text).toContain("coalesce");
    expect(database.queries[0].text).toContain("checkpoint->>'neonAuthSubject'");
    database.assertExhausted();
  });

  it("runs deletion completion inside the SQL transaction seam", async () => {
    const database = createLifecycleSqlDouble();
    database.respond([tombstoneRow()]);
    const repository = new PostgresControlPlaneLifecycleRepository(database.sql);

    await expect(repository.completeDeletion(completionInput())).resolves.toMatchObject({
      deletionId,
      verificationHash: "verified-hash",
    });
    expect(database.sql.begin).toHaveBeenCalledTimes(1);
    database.assertExhausted();
  });

  it("rejects incomplete physical/auth verification before relational deletion", async () => {
    const database = createLifecycleSqlDouble();
    const repository = new PostgresControlPlaneLifecycleRepository(database.sql);

    await expect(
      repository.completeDeletion(completionInput({ zeroObjectCount: 1 }))
    ).rejects.toThrow("Deletion verification is incomplete");
    await expect(
      repository.completeDeletion(completionInput({ authPurged: false }))
    ).rejects.toThrow("Deletion verification is incomplete");
    expect(database.queries).toHaveLength(0);
  });

  it("deletes the user, verifies every protected table, writes a content-free tombstone, and audits", async () => {
    const database = createLifecycleSqlDouble();
    database.respond([], [], [], []);
    const repository = new PostgresControlPlaneLifecycleRepository(database.sql);

    const result = await repository.completeDeletion(completionInput());

    const expectedHash = createHash("sha256").update(`v1:${deletionId}:0:0:true`).digest("hex");
    expect(result).toEqual({
      deletionId,
      zeroRowCount: 0,
      zeroObjectCount: 0,
      authPurged: true,
      verificationHash: expectedHash,
    });
    expect(database.queries[1]).toMatchObject({
      text: "DELETE FROM public.users WHERE id=$1::uuid",
      values: [userId],
    });
    expect(database.unsafeQueries).toHaveLength(tenantProtectedTables.length);
    expect(database.unsafeQueries.every(({ values }) => values[0] === userId)).toBe(true);
    expect(database.queries[2]).toMatchObject({
      text: expect.stringContaining("INSERT INTO public.account_deletion_tombstones"),
      values: [deletionId, at, expectedHash],
    });
    const audit = database.queries[3];
    expect(audit.text).toContain("INSERT INTO public.operator_audit_events");
    expect(audit.values).not.toContain(userId);
    expect(audit.values).toContain(createHash("sha256").update(userId).digest("hex"));
    database.assertExhausted();
  });

  it("fails closed before tombstone creation when any relational row remains", async () => {
    const database = createLifecycleSqlDouble();
    database.respond([], []);
    database.respondUnsafe([{ count: 1 }]);
    const repository = new PostgresControlPlaneLifecycleRepository(database.sql);

    await expect(repository.completeDeletion(completionInput())).rejects.toThrow(
      "Relational purge verification failed"
    );
    expect(database.unsafeQueries).toHaveLength(tenantProtectedTables.length);
    expect(
      database.queries.every(({ text }) => !text.includes("account_deletion_tombstones"))
    ).toBe(false);
    expect(
      database.queries.some(({ text }) =>
        text.startsWith("INSERT INTO public.account_deletion_tombstones")
      )
    ).toBe(false);
    database.assertExhausted();
  });

  it("conceals a lost suspension CAS without revoking any credentials", async () => {
    const database = createLifecycleSqlDouble();
    database.respond([]);
    const repository = new PostgresControlPlaneLifecycleRepository(database.sql);

    await expect(
      repository.suspendAccount({ userId, actorId, requestId, reason: "incident", at })
    ).resolves.toBe(false);
    expect(database.sql.begin).toHaveBeenCalledTimes(1);
    expect(database.queries).toHaveLength(1);
    database.assertExhausted();
  });

  it("suspends atomically, revokes exact-email invitations/OAuth states, cancels jobs, and audits", async () => {
    const database = createLifecycleSqlDouble();
    database.respond(
      [{ id: userId, primary_email: "amit@example.com" }],
      [],
      [],
      [],
      [],
      [],
      [],
      []
    );
    const repository = new PostgresControlPlaneLifecycleRepository(database.sql);

    await expect(
      repository.suspendAccount({ userId, actorId, requestId, reason: "security incident", at })
    ).resolves.toBe(true);

    const texts = database.queries.map(({ text }) => text);
    expect(texts).toEqual(
      expect.arrayContaining([
        expect.stringContaining("UPDATE public.capture_tokens"),
        expect.stringContaining("UPDATE public.session_metadata"),
        expect.stringContaining("DELETE FROM public.oauth_tokens WHERE user_id=$1::uuid"),
        expect.stringContaining("DELETE FROM public.connector_oauth_states WHERE user_id=$1::uuid"),
        expect.stringContaining("WHERE normalized_email=$4 AND status='pending'"),
        expect.stringContaining("cancellation_reason='account_suspension'"),
        expect.stringContaining("INSERT INTO public.operator_audit_events"),
      ])
    );
    expect(database.queries[5].values).toEqual([
      actorId,
      "security incident",
      at,
      "amit@example.com",
    ]);
    expect(database.queries[7].values).not.toContain(userId);
    expect(database.queries[7].values).toContain(createHash("sha256").update(userId).digest("hex"));
    database.assertExhausted();
  });

  it("does not revoke invitations by email when the account has no primary email", async () => {
    const database = createLifecycleSqlDouble();
    database.respond([{ id: userId, primary_email: null }], [], [], [], [], [], []);
    const repository = new PostgresControlPlaneLifecycleRepository(database.sql);

    await expect(
      repository.suspendAccount({ userId, actorId, requestId, reason: "security incident", at })
    ).resolves.toBe(true);
    expect(database.queries.every(({ text }) => !text.includes("UPDATE public.invitations"))).toBe(
      true
    );
    database.assertExhausted();
  });

  it("allows only the privileged audit action vocabulary and hashes its target", async () => {
    const database = createLifecycleSqlDouble();
    database.respond([]);
    const repository = new PostgresControlPlaneLifecycleRepository(database.sql);

    await expect(
      repository.audit({
        id: auditId,
        actorId,
        action: "account.read",
        targetUserId: userId,
        reason: "unsupported",
        requestId,
        outcome: "no-op",
        at,
      })
    ).rejects.toThrow("Unsupported privileged audit action");
    await repository.audit({
      id: auditId,
      actorId,
      action: "account.restore",
      targetUserId: userId,
      reason: "restore drill",
      requestId,
      outcome: "succeeded",
      metadata: { rows: 0, verified: true },
      at,
    });

    expect(database.sql.json).toHaveBeenCalledWith({ rows: 0, verified: true });
    expect(database.queries[0].values).toEqual([
      auditId,
      actorId,
      "account.restore",
      createHash("sha256").update(userId).digest("hex"),
      "restore drill",
      requestId,
      "succeeded",
      { encodedJson: { rows: 0, verified: true } },
      at,
    ]);
    database.assertExhausted();
  });
});
