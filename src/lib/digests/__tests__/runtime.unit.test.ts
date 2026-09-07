import { createDigestJobHandler, DIGEST_QUEUE_JOB, enqueueDigestRuntimeJob } from "../runtime";
import type { DigestStore } from "../types";

const store = (): DigestStore =>
  ({
    getPreferences: jest.fn().mockResolvedValue({
      digestEnabled: true,
      digestTimezone: "UTC",
      personalizationEnabled: true,
      updatedAt: "2026-09-07T00:00:00.000Z",
    }),
    updatePreferences: jest.fn(),
    resetPreferences: jest.fn(),
    findDigest: jest.fn().mockResolvedValue({ id: "already-run" }),
    listDigests: jest.fn(),
    createDigest: jest.fn(),
    dismissDigest: jest.fn(),
    listPriorityCandidates: jest.fn(),
    listResurfacedCandidates: jest.fn(),
    enqueue: jest.fn(),
  }) as never;

describe("digest durable job runtime", () => {
  it("uses a stable queue key for a local date", async () => {
    const enqueue = jest.fn();
    const job = {
      id: "ledger-id",
      localDate: "2026-09-07",
      idempotencyKey: "digest:2026-09-07",
      status: "queued" as const,
      requestedBy: "cron" as const,
      createdAt: "2026-09-07T02:00:00.000Z",
    };
    await enqueueDigestRuntimeJob({ enqueue } as never, job);
    await enqueueDigestRuntimeJob({ enqueue } as never, job);
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      jobType: DIGEST_QUEUE_JOB,
      id: enqueue.mock.calls[1][0].id,
      payload: JSON.stringify({ localDate: job.localDate, idempotencyKey: job.idempotencyKey }),
    });
  });

  it("validates job messages before producing an idempotent digest", async () => {
    const handler = createDigestJobHandler(store());
    await expect(
      handler({ localDate: "2026-09-07", idempotencyKey: "digest:2026-09-07" })
    ).resolves.toBeUndefined();
    await expect(
      handler({ localDate: "bad", idempotencyKey: "digest:2026-09-07" })
    ).rejects.toBeDefined();
  });

  it("treats an opt-out after enqueue as a successful no-op", async () => {
    const disabled = store();
    jest.mocked(disabled.getPreferences).mockResolvedValueOnce({
      digestEnabled: false,
      digestTimezone: "UTC",
      personalizationEnabled: true,
      updatedAt: "2026-09-07T00:00:00.000Z",
    });
    await expect(
      createDigestJobHandler(disabled)({
        localDate: "2026-09-07",
        idempotencyKey: "digest:2026-09-07",
      })
    ).resolves.toBeUndefined();
    expect(disabled.findDigest).not.toHaveBeenCalled();
  });
});
