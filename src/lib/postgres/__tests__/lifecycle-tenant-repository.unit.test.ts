import { createAuthContext } from "@/lib/contracts";
import { PostgresTenantLifecycleRepository } from "@/lib/postgres/lifecycle-repositories";

import { createLifecycleSqlDouble } from "./lifecycle-sql-double";

const userId = "10000000-0000-4000-8000-000000000010";
const exportId = "20000000-0000-4000-8000-000000000020";
const deletionId = "30000000-0000-4000-8000-000000000030";
const actorId = "40000000-0000-4000-8000-000000000040";
const requestId = "50000000-0000-4000-8000-000000000050";
const at = "2026-09-08T12:00:00.000Z";
const context = createAuthContext({
  userId,
  actorKind: "user",
  actorId: userId,
  requestId,
});

function exportRow(overrides: Record<string, unknown> = {}) {
  return {
    id: exportId,
    user_id: userId,
    status: "ready",
    idempotency_key: "export-key-1",
    manifest_version: "1",
    object_ref: `exports:${exportId}:1`,
    content_hash: "content-hash",
    size_bytes: "42",
    requested_at: new Date("2026-09-08T00:00:00.000Z"),
    updated_at: "2026-09-08T01:00:00.000Z",
    completed_at: new Date("2026-09-08T01:00:00.000Z"),
    download_expires_at: "2026-09-09T00:00:00.000Z",
    purge_after: "2026-09-15T00:00:00.000Z",
    ...overrides,
  };
}

function deletionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: deletionId,
    user_id: userId,
    status: "requested",
    checkpoint: { phase: "queued" },
    requested_at: "2026-09-01T00:00:00.000Z",
    purge_after: "2026-09-15T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function usageRow(overrides: Record<string, unknown> = {}) {
  return {
    billing_date: "2026-09-08",
    operation: "ai.requests",
    provider: "openai",
    request_count: "3",
    input_tokens: "100",
    output_tokens: "25",
    cost_microusd: "50",
    ...overrides,
  };
}

describe("PostgresTenantLifecycleRepository", () => {
  it("maps an existing idempotent export and scopes its advisory lock to the tenant", async () => {
    const database = createLifecycleSqlDouble();
    database.respond([], [exportRow({ failure_code: "RETRIED" })]);
    const repository = new PostgresTenantLifecycleRepository(database.sql, context);

    await expect(
      repository.createExport({
        id: exportId,
        idempotencyKey: "export-key-1",
        requestedAt: at,
        downloadExpiresAt: "2026-09-09T12:00:00.000Z",
        purgeAfter: "2026-09-15T12:00:00.000Z",
      })
    ).resolves.toMatchObject({
      created: false,
      record: {
        id: exportId,
        userId,
        manifestVersion: 1,
        sizeBytes: 42,
        requestedAt: "2026-09-08T00:00:00.000Z",
        failureCode: "RETRIED",
      },
    });
    expect(database.queries[0].values).toContain(`export:${userId}:export-key-1`);
    database.assertExhausted();
  });

  it("inserts a new export after the owner-scoped idempotency lookup misses", async () => {
    const database = createLifecycleSqlDouble();
    database.respond(
      [],
      [],
      [exportRow({ status: "pending", object_ref: null, content_hash: null })]
    );
    const repository = new PostgresTenantLifecycleRepository(database.sql, context);

    await expect(
      repository.createExport({
        id: exportId,
        idempotencyKey: "export-key-2",
        requestedAt: at,
        downloadExpiresAt: "2026-09-09T12:00:00.000Z",
        purgeAfter: "2026-09-15T12:00:00.000Z",
      })
    ).resolves.toMatchObject({ created: true, record: { status: "pending" } });
    expect(database.queries[2]).toMatchObject({
      text: expect.stringContaining("INSERT INTO account_exports"),
      values: expect.arrayContaining([exportId, userId, "export-key-2"]),
    });
    database.assertExhausted();
  });

  it("conceals missing exports and maps list/CAS success and failure", async () => {
    const database = createLifecycleSqlDouble();
    database.respond(
      [],
      [exportRow(), exportRow({ id: "21000000-0000-4000-8000-000000000021" })],
      [exportRow({ status: "running" })],
      [],
      [exportRow()],
      [],
      [],
      [exportRow({ status: "expired", object_ref: null })],
      []
    );
    const repository = new PostgresTenantLifecycleRepository(database.sql, context);

    await expect(repository.findExport(exportId)).resolves.toBeUndefined();
    await expect(repository.listExports({ limit: 2 })).resolves.toHaveLength(2);
    await expect(repository.claimExport(exportId, at)).resolves.toMatchObject({
      status: "running",
    });
    await expect(repository.claimExport(exportId, at)).resolves.toBeUndefined();
    await expect(
      repository.completeExport({
        id: exportId,
        objectRef: `exports:${exportId}:1`,
        contentHash: "content-hash",
        sizeBytes: 42,
        completedAt: at,
      })
    ).resolves.toMatchObject({ status: "ready" });
    await expect(
      repository.completeExport({
        id: exportId,
        objectRef: `exports:${exportId}:1`,
        contentHash: "content-hash",
        sizeBytes: 42,
        completedAt: at,
      })
    ).resolves.toBeUndefined();
    await repository.failExport(exportId, "FAILED", at);
    await expect(repository.expireExport(exportId, at)).resolves.toMatchObject({
      status: "expired",
    });
    await expect(repository.expireExport(exportId, at)).resolves.toBeUndefined();
    expect(database.queries[0].text).toContain("WHERE id=$1::uuid LIMIT 1");
    expect(database.queries[0].values).toEqual([exportId]);
    expect(database.queries[2].text).toContain("status IN ('pending','failed')");
    expect(database.queries[4].text).toContain("AND status='running'");
    database.assertExhausted();
  });

  it("reads the explicit export dataset allowlist through unsafe static SQL", async () => {
    const database = createLifecycleSqlDouble();
    database.respondUnsafe([{ value: { id: userId, displayName: "Amit" } }]);
    const repository = new PostgresTenantLifecycleRepository(database.sql, context);

    const datasets = await repository.readExportDatasets();

    expect(datasets).toHaveLength(27);
    expect(datasets[0]).toEqual({
      name: "profile",
      rows: [{ id: userId, displayName: "Amit" }],
    });
    expect(datasets.at(-1)).toEqual({ name: "usage", rows: [] });
    expect(database.unsafeQueries).toHaveLength(27);
    expect(database.unsafeQueries[0].text).toContain("primaryEmail");
    expect(database.unsafeQueries.at(-1)?.text).toContain("usage_counters");
    database.assertExhausted();
  });

  it("returns an existing deletion without repeating immediate revocation", async () => {
    const database = createLifecycleSqlDouble();
    database.respond([], [deletionRow()]);
    const repository = new PostgresTenantLifecycleRepository(database.sql, context);

    await expect(
      repository.requestDeletion({ id: deletionId, requestedAt: at, purgeAfter: at })
    ).resolves.toMatchObject({ created: false, record: { id: deletionId } });
    expect(database.queries).toHaveLength(2);
    expect(database.queries[0].values).toContain(`deletion:${userId}`);
    database.assertExhausted();
  });

  it("atomically revokes tenant credentials, OAuth state, and queued work before inserting deletion", async () => {
    const database = createLifecycleSqlDouble();
    database.respond([], [], [{ id: userId }], [], [], [], [], [], [], [deletionRow()]);
    const repository = new PostgresTenantLifecycleRepository(database.sql, context);

    await expect(
      repository.requestDeletion({ id: deletionId, requestedAt: at, purgeAfter: at })
    ).resolves.toMatchObject({ created: true, record: { checkpoint: { phase: "queued" } } });
    expect(database.queries.map(({ text }) => text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("UPDATE capture_tokens"),
        expect.stringContaining("UPDATE session_metadata"),
        "DELETE FROM oauth_tokens",
        "DELETE FROM connector_oauth_states",
        expect.stringContaining("cancellation_reason='account_deletion'"),
        expect.stringContaining("INSERT INTO account_deletions"),
      ])
    );
    expect(database.queries.at(-1)?.values).toEqual([deletionId, userId, at, at, at]);
    database.assertExhausted();
  });

  it("fails deletion creation when the active-account CAS loses", async () => {
    const database = createLifecycleSqlDouble();
    database.respond([], [], []);
    const repository = new PostgresTenantLifecycleRepository(database.sql, context);

    await expect(
      repository.requestDeletion({ id: deletionId, requestedAt: at, purgeAfter: at })
    ).rejects.toThrow("Account is not active");
    expect(database.queries).toHaveLength(3);
    database.assertExhausted();
  });

  it("conceals a lost deletion-cancellation CAS and reactivates only after success", async () => {
    const database = createLifecycleSqlDouble();
    database.respond([], [deletionRow({ status: "cancelled", cancelled_at: at })], []);
    const repository = new PostgresTenantLifecycleRepository(database.sql, context);
    const input = { deletionId, actorId, reason: "user_requested", cancelledAt: at };

    await expect(repository.cancelDeletion(input)).resolves.toBeUndefined();
    expect(database.queries).toHaveLength(1);
    await expect(repository.cancelDeletion(input)).resolves.toMatchObject({
      status: "cancelled",
      cancelledAt: at,
    });
    expect(database.queries[2]).toMatchObject({
      text: expect.stringContaining("status='deletion_pending'"),
      values: [at, userId],
    });
    database.assertExhausted();
  });

  it("maps deletion lookup, usage counters, and quotas", async () => {
    const database = createLifecycleSqlDouble();
    database.respond(
      [deletionRow({ started_at: at, completed_at: at, failure_code: "RETRIED" })],
      [usageRow(), usageRow({ provider: null, request_count: 1 })],
      [
        { quota_key: "ai.requests", period: "month", hard_limit: "10" },
        { quota_key: "account.exports", period: "day", hard_limit: 2 },
      ]
    );
    const repository = new PostgresTenantLifecycleRepository(database.sql, context);

    await expect(repository.findDeletion()).resolves.toMatchObject({
      startedAt: at,
      completedAt: at,
      failureCode: "RETRIED",
    });
    await expect(
      repository.getUsage({ from: "2026-09-01", through: "2026-09-08" })
    ).resolves.toEqual([
      {
        date: "2026-09-08",
        operation: "ai.requests",
        provider: "openai",
        requestCount: 3,
        inputTokens: 100,
        outputTokens: 25,
        costMicrousd: 50,
      },
      expect.objectContaining({ provider: "", requestCount: 1 }),
    ]);
    await expect(repository.listQuotas()).resolves.toEqual([
      { quotaKey: "ai.requests", period: "month", hardLimit: 10 },
      { quotaKey: "account.exports", period: "day", hardLimit: 2 },
    ]);
    database.assertExhausted();
  });

  it("rejects unsafe usage deltas before locking", async () => {
    const database = createLifecycleSqlDouble();
    const repository = new PostgresTenantLifecycleRepository(database.sql, context);

    await expect(
      repository.consumeUsage({ date: "2026-09-08", operation: "ai.requests", requestCount: -1 })
    ).rejects.toThrow("Usage deltas must be nonnegative safe integers");
    await expect(
      repository.consumeUsage({
        date: "2026-09-08",
        operation: "ai.requests",
        costMicrousd: Number.MAX_SAFE_INTEGER + 1,
      })
    ).rejects.toThrow("Usage deltas must be nonnegative safe integers");
    expect(database.queries).toHaveLength(0);
  });

  it("returns the current counter without mutation when monthly quota is exhausted", async () => {
    const database = createLifecycleSqlDouble();
    database.respond(
      [],
      [{ quota_key: "ai.requests", period: "month", hard_limit: 10 }],
      [{ count: "10" }],
      [usageRow({ request_count: "10" })]
    );
    const repository = new PostgresTenantLifecycleRepository(database.sql, context);

    await expect(
      repository.consumeUsage({
        date: "2026-09-08",
        operation: "ai.requests",
        provider: "openai",
        requestCount: 1,
      })
    ).resolves.toEqual({
      allowed: false,
      counter: expect.objectContaining({ requestCount: 10 }),
      quota: { quotaKey: "ai.requests", period: "month", hardLimit: 10 },
    });
    expect(database.queries[2].values).toEqual(["ai.requests", "2026-09-01", "2026-09-08"]);
    expect(database.queries.every(({ text }) => !text.startsWith("UPDATE usage_counters"))).toBe(
      true
    );
    database.assertExhausted();
  });

  it("inserts the first counter and updates subsequent allowed usage", async () => {
    const database = createLifecycleSqlDouble();
    database.respond(
      [],
      [],
      [{ count: 0 }],
      [],
      [usageRow({ request_count: 1 })],
      [],
      [],
      [{ count: 1 }],
      [usageRow({ request_count: 3 })]
    );
    const repository = new PostgresTenantLifecycleRepository(database.sql, context);

    await expect(
      repository.consumeUsage({
        date: "2026-09-08",
        operation: "ai.requests",
        provider: "openai",
        requestCount: 1,
      })
    ).resolves.toEqual({ allowed: true, counter: expect.objectContaining({ requestCount: 1 }) });
    await expect(
      repository.consumeUsage({
        date: "2026-09-08",
        operation: "ai.requests",
        provider: "openai",
        requestCount: 2,
      })
    ).resolves.toEqual({ allowed: true, counter: expect.objectContaining({ requestCount: 3 }) });
    expect(database.queries.some(({ text }) => text.startsWith("INSERT INTO usage_counters"))).toBe(
      true
    );
    expect(
      database.queries.filter(({ text }) => text.startsWith("UPDATE usage_counters"))
    ).toHaveLength(2);
    database.assertExhausted();
  });
});
