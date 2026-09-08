import { createTenantJobEnvelopeV1 } from "@/lib/contracts/tenant-jobs";
import { objectContentHash, type TenantObjectStore } from "@/lib/storage/object-store";

import {
  ACCOUNT_LIFECYCLE_WORKER_ID,
  consumeLifecycleTenantJobEnvelope,
  createLifecycleTenantJobHandlers,
} from "../queue-runtime";

const userId = "10000000-0000-4000-8000-000000000010";
const exportId = "20000000-0000-4000-8000-000000000020";
const jobId = exportId;
const traceId = "30000000-0000-4000-8000-000000000030";

function exportRecord(status: "pending" | "running" | "ready") {
  return {
    id: exportId,
    userId,
    status,
    idempotencyKey: "export-idempotency",
    manifestVersion: 1,
    requestedAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    downloadExpiresAt: "2026-09-09T00:00:00.000Z",
    purgeAfter: "2026-09-15T00:00:00.000Z",
  };
}

function objectStore(): jest.Mocked<TenantObjectStore> {
  return {
    put: jest.fn(async (_context, ref, body, options) => ({
      ref,
      contentType: options.contentType,
      contentHash: objectContentHash(body),
      sizeBytes: body.byteLength,
      createdAt: options.createdAt ?? "2026-09-08T00:00:00.000Z",
    })),
    head: jest.fn(),
    read: jest.fn(),
    delete: jest.fn(),
    list: jest.fn(),
  };
}

function repositories(jobType = "account.export", payload: Record<string, unknown> = {}) {
  const pending = exportRecord("pending");
  const running = exportRecord("running");
  const ready = exportRecord("ready");
  return {
    jobs: {
      claim: jest.fn().mockResolvedValue({
        user_id: userId,
        id: jobId,
        job_type: jobType,
        idempotency_key: "job-idempotency",
        payload,
        status: "running",
      }),
      complete: jest.fn(),
      isCancellationRequested: jest.fn().mockResolvedValue(false),
    },
    agent: { insertAuditLog: jest.fn() },
    lifecycle: {
      findExport: jest.fn().mockResolvedValue(pending),
      claimExport: jest.fn().mockResolvedValue(running),
      readExportDatasets: jest.fn().mockResolvedValue([]),
      completeExport: jest.fn().mockResolvedValue(ready),
    },
  };
}

describe("account lifecycle queue runtime", () => {
  it("registers the export, retention-purge, and deletion handler allowlist", () => {
    expect([...createLifecycleTenantJobHandlers().keys()]).toEqual([
      "account.export",
      "account.export-expire",
      "account.deletion",
    ]);
  });

  it("claims a persisted export job and runs the real export handler", async () => {
    const store = objectStore();
    const repos = repositories("account.export", { exportId, jobId });
    const envelope = createTenantJobEnvelopeV1({
      userId,
      jobId,
      jobType: "account.export",
      traceId,
    });

    await expect(
      consumeLifecycleTenantJobEnvelope(envelope, {
        getTenantRepositories: jest.fn().mockResolvedValue(repos),
        getObjectStore: () => store,
      })
    ).resolves.toBe("completed");

    expect(repos.jobs.claim).toHaveBeenCalledWith(jobId, ACCOUNT_LIFECYCLE_WORKER_ID);
    expect(repos.lifecycle.claimExport).toHaveBeenCalledWith(exportId, expect.any(String));
    expect(store.put).toHaveBeenCalledWith(
      expect.objectContaining({ userId }),
      { objectType: "exports", objectId: exportId, version: 1 },
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: "application/zip" })
    );
    expect(repos.lifecycle.completeExport).toHaveBeenCalledWith(
      expect.objectContaining({ id: exportId, objectRef: `exports:${exportId}:1` })
    );
    expect(repos.jobs.complete).toHaveBeenCalledWith(jobId);
  });

  it("acknowledges unsupported jobs without resolving lifecycle dependencies", async () => {
    const getObjectStore = jest.fn(() => objectStore());
    const repos = repositories("account.unknown", { exportId, jobId });
    const envelope = createTenantJobEnvelopeV1({
      userId,
      jobId,
      jobType: "account.unknown",
      traceId,
    });

    await expect(
      consumeLifecycleTenantJobEnvelope(envelope, {
        getTenantRepositories: jest.fn().mockResolvedValue(repos),
        getObjectStore,
      })
    ).resolves.toBe("unsupported");

    expect(getObjectStore).not.toHaveBeenCalled();
    expect(repos.lifecycle.findExport).not.toHaveBeenCalled();
    expect(repos.jobs.complete).toHaveBeenCalledWith(jobId, "No tenant handler registered");
  });

  it("rejects a mismatched persisted job before resolving lifecycle dependencies", async () => {
    const getObjectStore = jest.fn(() => objectStore());
    const repos = repositories("account.export", { exportId, jobId });
    repos.jobs.claim.mockResolvedValueOnce({
      user_id: userId,
      id: jobId,
      job_type: "account.deletion",
      idempotency_key: "job-idempotency",
      payload: { deletionId: jobId, jobId },
      status: "running",
    });
    const envelope = createTenantJobEnvelopeV1({
      userId,
      jobId,
      jobType: "account.export",
      traceId,
    });

    await expect(
      consumeLifecycleTenantJobEnvelope(envelope, {
        getTenantRepositories: jest.fn().mockResolvedValue(repos),
        getObjectStore,
      })
    ).resolves.toBe("rejected");

    expect(getObjectStore).not.toHaveBeenCalled();
    expect(repos.lifecycle.findExport).not.toHaveBeenCalled();
    expect(repos.agent.insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "tenant_job_owner_mismatch_or_missing", traceId })
    );
  });

  it("fails closed before deletion purge work without an identity adapter", async () => {
    const getObjectStore = jest.fn(() => objectStore());
    const repos = repositories("account.deletion", { deletionId: jobId, jobId });
    const envelope = createTenantJobEnvelopeV1({
      userId,
      jobId,
      jobType: "account.deletion",
      traceId,
    });

    await expect(
      consumeLifecycleTenantJobEnvelope(envelope, {
        getTenantRepositories: jest.fn().mockResolvedValue(repos),
        getObjectStore,
      })
    ).resolves.toBe("failed");

    expect(getObjectStore).not.toHaveBeenCalled();
    expect(repos.lifecycle.findExport).not.toHaveBeenCalled();
    expect(repos.jobs.complete).toHaveBeenCalledWith(
      jobId,
      "Identity purge dependency is not configured for lifecycle workers"
    );
  });
});
