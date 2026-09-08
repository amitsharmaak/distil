import { createAuthContext } from "@/lib/contracts/tenant-context";
import { createTenantJobEnvelopeV1 } from "@/lib/contracts/tenant-jobs";
import { consumeTenantJobEnvelope, enqueueTenantJob } from "../tenant-runtime";

const userId = "10000000-0000-4000-8000-000000000010";
const otherUserId = "20000000-0000-4000-8000-000000000020";
const jobId = "10000000-0000-4000-8000-000000000012";
const traceId = "10000000-0000-4000-8000-000000000013";
const context = createAuthContext({
  userId,
  actorKind: "user",
  actorId: userId,
  requestId: traceId,
});

function repositories(owner = userId) {
  return {
    jobs: {
      enqueue: jest.fn(),
      claim: jest.fn().mockResolvedValue({
        user_id: owner,
        id: jobId,
        job_type: "capture.enrich",
        idempotency_key: "one",
        payload: { itemId: "item-1" },
        status: "running",
      }),
      complete: jest.fn(),
    },
    agent: { insertAuditLog: jest.fn() },
  };
}

describe("tenant job runtime", () => {
  it("writes owner identity to columns and not the JSON payload", async () => {
    const repos = repositories();
    const envelope = await enqueueTenantJob(context, repos as never, {
      jobId,
      jobType: "capture.enrich",
      idempotencyKey: "one",
      payload: { itemId: "item-1" },
    });
    expect(envelope).toEqual({ version: 1, userId, jobId, jobType: "capture.enrich", traceId });
    expect(repos.jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ userId, idempotencyKey: "one", payload: '{"itemId":"item-1"}' })
    );
    expect(JSON.parse(repos.jobs.enqueue.mock.calls[0][0].payload)).not.toHaveProperty("userId");
  });

  it("revalidates explicit owner columns before invoking a handler", async () => {
    const repos = repositories();
    const handler = jest.fn();
    const envelope = createTenantJobEnvelopeV1({
      userId,
      jobId,
      jobType: "capture.enrich",
      traceId,
    });
    await expect(
      consumeTenantJobEnvelope(envelope, {
        getTenantRepositories: jest.fn().mockResolvedValue(repos),
        handlers: new Map([["capture.enrich", handler]]),
      })
    ).resolves.toBe("completed");
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ userId }),
      { itemId: "item-1" },
      repos
    );
  });

  it("audits and acknowledges a forged owner without revealing the target", async () => {
    const repos = repositories(otherUserId);
    const handler = jest.fn();
    const envelope = createTenantJobEnvelopeV1({
      userId,
      jobId,
      jobType: "capture.enrich",
      traceId,
    });
    await expect(
      consumeTenantJobEnvelope(envelope, {
        getTenantRepositories: jest.fn().mockResolvedValue(repos),
        handlers: new Map([["capture.enrich", handler]]),
      })
    ).resolves.toBe("rejected");
    expect(handler).not.toHaveBeenCalled();
    expect(repos.agent.insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "tenant_job_owner_mismatch_or_missing", traceId })
    );
  });

  it("fails closed when the tenant claim disappears and honors an explicit worker id", async () => {
    const repos = repositories();
    repos.jobs.claim.mockResolvedValue(undefined);
    const envelope = createTenantJobEnvelopeV1({
      userId,
      jobId,
      jobType: "capture.enrich",
      traceId,
    });

    await expect(
      consumeTenantJobEnvelope(envelope, {
        getTenantRepositories: jest.fn().mockResolvedValue(repos),
        handlers: new Map(),
        workerId: "worker-42",
      })
    ).resolves.toBe("rejected");
    expect(repos.jobs.claim).toHaveBeenCalledWith(jobId, "worker-42");
    expect(repos.agent.insertAuditLog).toHaveBeenCalledTimes(1);
  });

  it("records safe failures when no handler is registered or a handler throws a non-Error", async () => {
    const envelope = createTenantJobEnvelopeV1({
      userId,
      jobId,
      jobType: "capture.enrich",
      traceId,
    });
    const unhandled = repositories();
    await expect(
      consumeTenantJobEnvelope(envelope, {
        getTenantRepositories: jest.fn().mockResolvedValue(unhandled),
        handlers: new Map(),
      })
    ).resolves.toBe("failed");
    expect(unhandled.jobs.complete).toHaveBeenCalledWith(jobId, "No tenant handler registered");

    const failed = repositories();
    await expect(
      consumeTenantJobEnvelope(envelope, {
        getTenantRepositories: jest.fn().mockResolvedValue(failed),
        handlers: new Map([["capture.enrich", jest.fn().mockRejectedValue("unexpected")]]),
      })
    ).resolves.toBe("failed");
    expect(failed.jobs.complete).toHaveBeenCalledWith(jobId, "Tenant job failed");

    const namedFailure = repositories();
    await expect(
      consumeTenantJobEnvelope(envelope, {
        getTenantRepositories: jest.fn().mockResolvedValue(namedFailure),
        handlers: new Map([
          ["capture.enrich", jest.fn().mockRejectedValue(new Error("upstream down"))],
        ]),
      })
    ).resolves.toBe("failed");
    expect(namedFailure.jobs.complete).toHaveBeenCalledWith(jobId, "upstream down");
  });

  it("keeps an explicit trace and defaults an omitted payload to an empty object", async () => {
    const repos = repositories();
    const explicitTrace = "30000000-0000-4000-8000-000000000030";

    await expect(
      enqueueTenantJob(context, repos as never, {
        jobId,
        jobType: "capture.enrich",
        traceId: explicitTrace,
        idempotencyKey: "empty-payload",
      })
    ).resolves.toMatchObject({ traceId: explicitTrace });
    expect(repos.jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ payload: "{}", idempotencyKey: "empty-payload" })
    );
  });
});
