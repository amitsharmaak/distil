import { createAuthContext, createSystemContext } from "@/lib/contracts";
import {
  ACCOUNT_DELETION_GRACE_MS,
  cancelAccountDeletion,
  processAccountDeletion,
  publicDeletion,
  requestAccountDeletion,
} from "@/lib/lifecycle/deletion";
import type { AccountDeletionRecord, ControlPlaneLifecycleRepository } from "@/lib/lifecycle/ports";
import type { TenantObjectStore } from "@/lib/storage/object-store";

const userId = "10000000-0000-4000-8000-000000000010";
const deletionId = "20000000-0000-4000-8000-000000000020";
const requestId = "30000000-0000-4000-8000-000000000030";
const actorId = "40000000-0000-4000-8000-000000000040";
const now = new Date("2026-09-08T12:00:00.000Z");
const context = createAuthContext({
  userId,
  actorKind: "user",
  actorId: userId,
  requestId,
});
const systemContext = createSystemContext({ actorKind: "system", actorId, requestId });

function deletion(
  status: AccountDeletionRecord["status"] = "requested",
  overrides: Partial<AccountDeletionRecord> = {}
): AccountDeletionRecord {
  return {
    id: deletionId,
    userId,
    status,
    checkpoint: {},
    requestedAt: "2026-09-01T00:00:00.000Z",
    purgeAfter: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  } as AccountDeletionRecord;
}

function controlRepository(
  overrides: Partial<jest.Mocked<ControlPlaneLifecycleRepository>> = {}
): jest.Mocked<ControlPlaneLifecycleRepository> {
  return {
    findDeletionVerification: jest.fn().mockResolvedValue(undefined),
    findDeletionWork: jest.fn().mockResolvedValue(deletion()),
    markDeletionPurging: jest.fn().mockResolvedValue(true),
    completeDeletion: jest.fn().mockResolvedValue({
      deletionId,
      zeroRowCount: 0,
      zeroObjectCount: 0,
      authPurged: true,
      verificationHash: "verified",
    }),
    failDeletion: jest.fn(),
    suspendAccount: jest.fn(),
    audit: jest.fn(),
    ...overrides,
  };
}

function objectStore(overrides: Partial<jest.Mocked<TenantObjectStore>> = {}) {
  return {
    put: jest.fn(),
    head: jest.fn(),
    read: jest.fn(),
    delete: jest.fn().mockResolvedValue(true),
    list: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as jest.Mocked<TenantObjectStore>;
}

function workerDependencies(
  control: jest.Mocked<ControlPlaneLifecycleRepository>,
  store = objectStore()
) {
  return {
    objectStore: store,
    authPurger: {
      revokeSessions: jest.fn(),
      deleteIdentity: jest.fn(),
    },
    getControlPlaneLifecycle: jest.fn().mockResolvedValue(control),
    systemContext,
  };
}

describe("account deletion lifecycle", () => {
  it("requests a seven-day delayed, high-priority durable purge job", async () => {
    const record = deletion();
    const repositories = {
      lifecycle: {
        requestDeletion: jest.fn().mockResolvedValue({ record, created: true }),
      },
      jobs: { enqueue: jest.fn() },
    };
    const dispatcher = { dispatch: jest.fn() };

    const result = await requestAccountDeletion(context, repositories as never, {
      confirmation: "DELETE MY ACCOUNT",
      now,
      dispatcher,
    });

    expect(result).toEqual({ deletion: record, jobId: deletionId, created: true });
    expect(repositories.lifecycle.requestDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedAt: now.toISOString(),
        purgeAfter: new Date(now.getTime() + ACCOUNT_DELETION_GRACE_MS).toISOString(),
      })
    );
    expect(repositories.jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        id: deletionId,
        jobType: "account.deletion",
        priority: 100,
        maxRetries: 20,
      })
    );
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: deletionId, jobType: "account.deletion" }),
      expect.objectContaining({ idempotencyKey: `account-deletion:${deletionId}` })
    );
  });

  it("cancels within grace, records the default reason, and cooperatively cancels queued work", async () => {
    const cancelled = deletion("cancelled", { cancelledAt: now.toISOString() });
    const repositories = {
      lifecycle: {
        findDeletion: jest.fn().mockResolvedValue(deletion()),
        cancelDeletion: jest.fn().mockResolvedValue(cancelled),
      },
      jobs: { requestCancellation: jest.fn() },
    };

    await expect(
      cancelAccountDeletion(context, repositories as never, { reason: "  ", now })
    ).resolves.toBe(cancelled);
    expect(repositories.lifecycle.cancelDeletion).toHaveBeenCalledWith({
      deletionId,
      actorId: userId,
      reason: "user_cancelled_within_grace_period",
      cancelledAt: now.toISOString(),
    });
    expect(repositories.jobs.requestCancellation).toHaveBeenCalledWith(
      deletionId,
      "account_deletion_cancelled",
      now.toISOString()
    );
  });

  it("does not enqueue cancellation when no live request can be transitioned", async () => {
    const repositories = {
      lifecycle: {
        findDeletion: jest.fn().mockResolvedValue(deletion()),
        cancelDeletion: jest.fn().mockResolvedValue(undefined),
      },
      jobs: { requestCancellation: jest.fn() },
    };

    await expect(cancelAccountDeletion(context, repositories as never, {})).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(repositories.jobs.requestCancellation).not.toHaveBeenCalled();
  });

  it("returns an existing verification without repeating destructive work", async () => {
    const verification = {
      deletionId,
      zeroRowCount: 0,
      zeroObjectCount: 0,
      authPurged: true,
      verificationHash: "already-complete",
    };
    const control = controlRepository({
      findDeletionVerification: jest.fn().mockResolvedValue(verification),
    });
    const dependencies = workerDependencies(control);

    await expect(
      processAccountDeletion(context, {} as never, dependencies, { deletionId, now })
    ).resolves.toEqual({ status: "completed", verification });
    expect(control.findDeletionWork).not.toHaveBeenCalled();
    expect(dependencies.objectStore.list).not.toHaveBeenCalled();
  });

  it("short-circuits a cancelled request and rejects premature or unclaimable work", async () => {
    const cancelledControl = controlRepository({
      findDeletionWork: jest.fn().mockResolvedValue(deletion("cancelled")),
    });
    await expect(
      processAccountDeletion(context, {} as never, workerDependencies(cancelledControl), {
        deletionId,
        now,
      })
    ).resolves.toEqual({ status: "cancelled" });

    const prematureControl = controlRepository({
      findDeletionWork: jest
        .fn()
        .mockResolvedValue(deletion("requested", { purgeAfter: "2026-09-09T00:00:00.000Z" })),
    });
    await expect(
      processAccountDeletion(context, {} as never, workerDependencies(prematureControl), {
        deletionId,
        now,
      })
    ).rejects.toThrow("Deletion grace period has not elapsed");

    const unclaimableControl = controlRepository({
      markDeletionPurging: jest.fn().mockResolvedValue(false),
    });
    await expect(
      processAccountDeletion(context, {} as never, workerDependencies(unclaimableControl), {
        deletionId,
        now,
      })
    ).rejects.toThrow("Deletion is not claimable");
  });

  it("purges every tenant object, provider identity, and records zero-count verification", async () => {
    const object = {
      ref: { objectType: "exports" as const, objectId: deletionId, version: 1 },
      contentType: "application/zip",
      contentHash: "hash",
      sizeBytes: 1,
      createdAt: now.toISOString(),
    };
    const store = objectStore({
      list: jest.fn().mockResolvedValueOnce([object]).mockResolvedValueOnce([]),
    });
    const control = controlRepository();
    const dependencies = workerDependencies(control, store);

    await expect(
      processAccountDeletion(context, {} as never, dependencies, { deletionId, now })
    ).resolves.toMatchObject({ status: "completed" });
    expect(store.delete).toHaveBeenCalledWith(
      expect.objectContaining({ userId, actorKind: "system", actorId }),
      object.ref
    );
    expect(dependencies.authPurger.revokeSessions).toHaveBeenCalledWith(userId);
    expect(dependencies.authPurger.deleteIdentity).toHaveBeenCalledWith(userId);
    expect(control.completeDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        deletionId,
        userId,
        zeroObjectCount: 0,
        authPurged: true,
        actorId,
        requestId,
      })
    );
  });

  it("checkpoints purge failure when objects remain", async () => {
    const object = {
      ref: { objectType: "exports" as const, objectId: deletionId, version: 1 },
      contentType: "application/zip",
      contentHash: "hash",
      sizeBytes: 1,
      createdAt: now.toISOString(),
    };
    const store = objectStore({
      list: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([object]),
    });
    const control = controlRepository();

    await expect(
      processAccountDeletion(context, {} as never, workerDependencies(control, store), {
        deletionId,
        now,
      })
    ).rejects.toThrow("Tenant objects remain after purge");
    expect(control.failDeletion).toHaveBeenCalledWith(
      deletionId,
      userId,
      "PURGE_FAILED",
      now.toISOString()
    );
    expect(control.completeDeletion).not.toHaveBeenCalled();
  });

  it("projects only public deletion fields", () => {
    expect(publicDeletion(deletion("failed", { failureCode: "PURGE_FAILED" }))).toEqual({
      id: deletionId,
      status: "failed",
      requestedAt: "2026-09-01T00:00:00.000Z",
      purgeAfter: "2026-09-08T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      cancelledAt: undefined,
      completedAt: undefined,
      failureCode: "PURGE_FAILED",
    });
  });
});
