import { createAuthContext } from "@/lib/contracts";
import {
  listAccountExports,
  processAccountExport,
  publicExport,
  purgeExpiredAccountExport,
  readAccountExportDownload,
  requestAccountExport,
} from "@/lib/lifecycle/exports";
import type { AccountExportRecord } from "@/lib/lifecycle/ports";
import { objectContentHash, type TenantObjectStore } from "@/lib/storage/object-store";

const userId = "10000000-0000-4000-8000-000000000010";
const exportId = "20000000-0000-4000-8000-000000000020";
const requestId = "30000000-0000-4000-8000-000000000030";
const now = new Date("2026-09-08T12:00:00.000Z");
const context = createAuthContext({
  userId,
  actorKind: "user",
  actorId: userId,
  requestId,
});

function exportRecord(
  status: AccountExportRecord["status"] = "pending",
  overrides: Partial<AccountExportRecord> = {}
): AccountExportRecord {
  return {
    id: exportId,
    userId,
    status,
    idempotencyKey: "export-key-1",
    manifestVersion: 1,
    requestedAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    downloadExpiresAt: "2026-09-09T00:00:00.000Z",
    purgeAfter: "2026-09-15T00:00:00.000Z",
    ...overrides,
  } as AccountExportRecord;
}

function objectStore(overrides: Partial<jest.Mocked<TenantObjectStore>> = {}) {
  return {
    put: jest.fn(async (_context, ref, body, options) => ({
      ref,
      contentType: options.contentType,
      contentHash: objectContentHash(body),
      sizeBytes: body.byteLength,
      createdAt: options.createdAt ?? now.toISOString(),
    })),
    head: jest.fn(),
    read: jest.fn(),
    delete: jest.fn().mockResolvedValue(true),
    list: jest.fn(),
    ...overrides,
  } as jest.Mocked<TenantObjectStore>;
}

function exportRepositories(overrides: Record<string, unknown> = {}) {
  const pending = exportRecord();
  const running = exportRecord("running");
  const ready = exportRecord("ready", {
    objectRef: `exports:${exportId}:1`,
    contentHash: "ready-hash",
    sizeBytes: 100,
    completedAt: now.toISOString(),
  });
  return {
    lifecycle: {
      createExport: jest.fn().mockResolvedValue({ record: pending, created: true }),
      listExports: jest.fn().mockResolvedValue([ready]),
      findExport: jest.fn().mockResolvedValue(pending),
      claimExport: jest.fn().mockResolvedValue(running),
      completeExport: jest.fn().mockResolvedValue(ready),
      failExport: jest.fn(),
      expireExport: jest.fn().mockResolvedValue(exportRecord("expired")),
      readExportDatasets: jest.fn().mockResolvedValue([]),
      consumeUsage: jest.fn().mockResolvedValue({ allowed: true }),
      ...overrides,
    },
    jobs: {
      enqueue: jest.fn(),
      isCancellationRequested: jest.fn().mockResolvedValue(false),
    },
  };
}

describe("account export runtime", () => {
  it("rejects malformed idempotency keys before persistence", async () => {
    const repositories = exportRepositories();

    await expect(
      requestAccountExport(context, repositories as never, { idempotencyKey: "short", now })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST", status: 400 });
    expect(repositories.lifecycle.createExport).not.toHaveBeenCalled();
  });

  it("fails and marks a newly created export when its quota is exhausted", async () => {
    const repositories = exportRepositories({
      consumeUsage: jest.fn().mockResolvedValue({ allowed: false }),
    });

    await expect(
      requestAccountExport(context, repositories as never, {
        idempotencyKey: "export-request-123",
        now,
      })
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED", status: 429 });
    expect(repositories.lifecycle.failExport).toHaveBeenCalledWith(
      exportId,
      "QUOTA_EXCEEDED",
      now.toISOString()
    );
    expect(repositories.jobs.enqueue).not.toHaveBeenCalled();
  });

  it("re-publishes both durable jobs on an idempotent request without double-charging quota", async () => {
    const record = exportRecord();
    const repositories = exportRepositories({
      createExport: jest.fn().mockResolvedValue({ record, created: false }),
    });

    await expect(
      requestAccountExport(context, repositories as never, {
        idempotencyKey: "export-request-123",
        now,
      })
    ).resolves.toEqual({ export: record, jobId: exportId, created: false });
    expect(repositories.lifecycle.consumeUsage).not.toHaveBeenCalled();
    expect(repositories.jobs.enqueue).toHaveBeenCalledTimes(2);
    expect(repositories.jobs.enqueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: exportId,
        jobType: "account.export",
        idempotencyKey: `account-export:${exportId}`,
      })
    );
    expect(repositories.jobs.enqueue).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        jobType: "account.export-expire",
        idempotencyKey: `account-export-expire:${exportId}`,
        runAfter: record.purgeAfter,
      })
    );
  });

  it("validates list bounds and exposes only the public export projection", async () => {
    const repositories = exportRepositories();

    await expect(listAccountExports(repositories as never, { limit: 0 })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    await expect(listAccountExports(repositories as never, { limit: 101 })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    await expect(listAccountExports(repositories as never, { limit: 1 })).resolves.toEqual([
      publicExport(
        exportRecord("ready", {
          objectRef: `exports:${exportId}:1`,
          contentHash: "ready-hash",
          sizeBytes: 100,
          completedAt: now.toISOString(),
        })
      ),
    ]);
    expect(repositories.lifecycle.listExports).toHaveBeenCalledWith({ limit: 1 });
  });

  it("honors cooperative cancellation before claiming an export", async () => {
    const repositories = exportRepositories();
    repositories.jobs.isCancellationRequested.mockResolvedValueOnce(true);

    await expect(
      processAccountExport(context, repositories as never, objectStore(), {
        exportId,
        jobId: exportId,
        now,
      })
    ).rejects.toThrow("Job cancellation requested");
    expect(repositories.lifecycle.claimExport).not.toHaveBeenCalled();
    expect(repositories.lifecycle.failExport).not.toHaveBeenCalled();
  });

  it("records generation failure when cancellation arrives after reading datasets", async () => {
    const repositories = exportRepositories();
    repositories.jobs.isCancellationRequested
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(
      processAccountExport(context, repositories as never, objectStore(), {
        exportId,
        jobId: exportId,
        now,
      })
    ).rejects.toThrow("Job cancellation requested");
    expect(repositories.lifecycle.failExport).toHaveBeenCalledWith(
      exportId,
      "EXPORT_GENERATION_FAILED",
      now.toISOString()
    );
  });

  it("deletes a just-written archive when cancellation arrives before completion", async () => {
    const repositories = exportRepositories();
    repositories.jobs.isCancellationRequested
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const store = objectStore();

    await expect(
      processAccountExport(context, repositories as never, store, {
        exportId,
        jobId: exportId,
        now,
      })
    ).rejects.toThrow("Job cancellation requested");
    expect(store.delete).toHaveBeenCalledWith(context, {
      objectType: "exports",
      objectId: exportId,
      version: 1,
    });
    expect(repositories.lifecycle.completeExport).not.toHaveBeenCalled();
    expect(repositories.lifecycle.failExport).toHaveBeenCalled();
  });

  it("records a failed transition when a generated archive cannot be completed", async () => {
    const repositories = exportRepositories({
      completeExport: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      processAccountExport(context, repositories as never, objectStore(), {
        exportId,
        jobId: exportId,
        now,
      })
    ).rejects.toThrow("Export completion transition failed");
    expect(repositories.lifecycle.failExport).toHaveBeenCalled();
  });

  it("purges an elapsed export object and verifies it is gone before expiring the row", async () => {
    const record = exportRecord("ready", {
      objectRef: `exports:${exportId}:1`,
      purgeAfter: "2026-09-08T00:00:00.000Z",
    });
    const repositories = exportRepositories({ findExport: jest.fn().mockResolvedValue(record) });
    const store = objectStore({ head: jest.fn().mockResolvedValue(undefined) });

    await expect(
      purgeExpiredAccountExport(context, repositories as never, store, exportId, now)
    ).resolves.toMatchObject({ status: "expired" });
    expect(store.delete).toHaveBeenCalledWith(context, {
      objectType: "exports",
      objectId: exportId,
      version: 1,
    });
    expect(repositories.lifecycle.expireExport).toHaveBeenCalledWith(exportId, now.toISOString());
  });

  it("refuses early retention and refuses to expire a row while its object remains", async () => {
    const earlyRepositories = exportRepositories();
    await expect(
      purgeExpiredAccountExport(context, earlyRepositories as never, objectStore(), exportId, now)
    ).rejects.toThrow("Export retention period has not elapsed");

    const record = exportRecord("ready", {
      objectRef: `exports:${exportId}:1`,
      purgeAfter: "2026-09-08T00:00:00.000Z",
    });
    const remainingStore = objectStore({
      head: jest.fn().mockResolvedValue({ ref: {}, contentHash: "still-there" }),
    });
    await expect(
      purgeExpiredAccountExport(
        context,
        exportRepositories({ findExport: jest.fn().mockResolvedValue(record) }) as never,
        remainingStore,
        exportId,
        now
      )
    ).rejects.toThrow("Export object remains after retention purge");
  });

  it("rejects downloads that are not ready, expired, missing, or fail integrity", async () => {
    await expect(
      readAccountExportDownload(
        context,
        exportRepositories() as never,
        objectStore(),
        exportId,
        now
      )
    ).rejects.toMatchObject({ code: "NOT_READY" });

    const expired = exportRecord("ready", {
      objectRef: `exports:${exportId}:1`,
      contentHash: "expected",
      sizeBytes: 4,
      downloadExpiresAt: now.toISOString(),
    });
    await expect(
      readAccountExportDownload(
        context,
        exportRepositories({ findExport: jest.fn().mockResolvedValue(expired) }) as never,
        objectStore(),
        exportId,
        now
      )
    ).rejects.toMatchObject({ code: "EXPIRED" });

    const ready = { ...expired, downloadExpiresAt: "2026-09-09T00:00:00.000Z" };
    await expect(
      readAccountExportDownload(
        context,
        exportRepositories({ findExport: jest.fn().mockResolvedValue(ready) }) as never,
        objectStore({ read: jest.fn().mockResolvedValue(undefined) }),
        exportId,
        now
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      readAccountExportDownload(
        context,
        exportRepositories({ findExport: jest.fn().mockResolvedValue(ready) }) as never,
        objectStore({
          read: jest.fn().mockResolvedValue({
            ref: { objectType: "exports", objectId: exportId, version: 1 },
            contentType: "application/zip",
            contentHash: "wrong",
            sizeBytes: 4,
            createdAt: now.toISOString(),
            body: new Uint8Array(4),
          }),
        }),
        exportId,
        now
      )
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("returns a verified ready download", async () => {
    const body = new TextEncoder().encode("data");
    const contentHash = objectContentHash(body);
    const record = exportRecord("ready", {
      objectRef: `exports:${exportId}:1`,
      contentHash,
      sizeBytes: body.byteLength,
    });
    const object = {
      ref: { objectType: "exports" as const, objectId: exportId, version: 1 },
      contentType: "application/zip",
      contentHash,
      sizeBytes: body.byteLength,
      createdAt: now.toISOString(),
      body,
    };

    await expect(
      readAccountExportDownload(
        context,
        exportRepositories({ findExport: jest.fn().mockResolvedValue(record) }) as never,
        objectStore({ read: jest.fn().mockResolvedValue(object) }),
        exportId,
        now
      )
    ).resolves.toEqual({ record, object });
  });
});
