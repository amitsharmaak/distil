import { CaptureProcessingError, CaptureRetryScheduledError } from "../errors";
import { CaptureWorker, createDefaultCaptureProcessor } from "../worker";
import { captureRecord, MemoryCaptureRepository, publicDns } from "./fixtures";

describe("CaptureWorker state machine", () => {
  const now = () => new Date("2026-01-01T01:00:00.000Z");

  it("transitions queued to processing to ready and records the item", async () => {
    const record = captureRecord();
    const captures = new MemoryCaptureRepository([record]);
    const worker = new CaptureWorker({
      captures,
      processor: jest.fn().mockResolvedValue({ status: "ready", itemId: "item-1" }),
      now,
    });
    await expect(worker.handle({ version: 1, captureId: record.id })).resolves.toMatchObject({
      status: "ready",
      attempts: 1,
      itemId: "item-1",
    });
  });

  it("transitions queued to processing to rejected for rejected content", async () => {
    const record = captureRecord();
    const captures = new MemoryCaptureRepository([record]);
    const worker = new CaptureWorker({
      captures,
      processor: jest.fn().mockResolvedValue({ status: "rejected", reason: "not an article" }),
      now,
    });
    await expect(worker.handle({ version: 1, captureId: record.id })).resolves.toMatchObject({
      status: "rejected",
      retryable: false,
      lastErrorCode: "CONTENT_REJECTED",
    });
  });

  it("transitions processing back to queued and asks the queue to retry a transient failure", async () => {
    const record = captureRecord();
    const captures = new MemoryCaptureRepository([record]);
    const worker = new CaptureWorker({
      captures,
      processor: jest
        .fn()
        .mockRejectedValue(new CaptureProcessingError("UPSTREAM_503", "busy", "transient")),
      now,
    });
    await expect(worker.handle({ version: 1, captureId: record.id })).rejects.toBeInstanceOf(
      CaptureRetryScheduledError
    );
    await expect(captures.findById(record.id)).resolves.toMatchObject({
      status: "queued",
      retryable: true,
      attempts: 1,
    });
  });

  it("transitions processing to failed after five transient attempts", async () => {
    const record = captureRecord({ attempts: 4 });
    const captures = new MemoryCaptureRepository([record]);
    const worker = new CaptureWorker({
      captures,
      processor: jest
        .fn()
        .mockRejectedValue(new CaptureProcessingError("UPSTREAM_429", "limited", "transient")),
      now,
    });
    await expect(worker.handle({ version: 1, captureId: record.id })).resolves.toMatchObject({
      status: "failed",
      retryable: false,
      attempts: 5,
    });
  });

  it("transitions processing directly to failed for definitive upstream 4xx", async () => {
    const record = captureRecord();
    const captures = new MemoryCaptureRepository([record]);
    const worker = new CaptureWorker({
      captures,
      processor: jest
        .fn()
        .mockRejectedValue(new CaptureProcessingError("UPSTREAM_404", "missing", "terminal")),
      now,
    });
    await expect(worker.handle({ version: 1, captureId: record.id })).resolves.toMatchObject({
      status: "failed",
      retryable: false,
      attempts: 1,
    });
  });

  it("transitions processing to rejected for an unsafe redirect", async () => {
    const record = captureRecord();
    const captures = new MemoryCaptureRepository([record]);
    const worker = new CaptureWorker({
      captures,
      processor: jest
        .fn()
        .mockRejectedValue(new CaptureProcessingError("UNSAFE_URL", "private", "rejected")),
      now,
    });
    await expect(worker.handle({ version: 1, captureId: record.id })).resolves.toMatchObject({
      status: "rejected",
      retryable: false,
    });
  });

  test.each(["ready", "rejected", "failed"] as const)(
    "treats duplicate delivery after terminal %s as a no-op",
    async (status) => {
      const processor = jest.fn();
      const record = captureRecord({ status });
      const result = await new CaptureWorker({
        captures: new MemoryCaptureRepository([record]),
        processor,
        now,
      }).handle({ version: 1, captureId: record.id });
      expect(result?.status).toBe(status);
      expect(processor).not.toHaveBeenCalled();
    }
  );

  it("leaves a recently processing capture alone on concurrent duplicate delivery", async () => {
    const processor = jest.fn();
    const record = captureRecord({ status: "processing", updatedAt: "2026-01-01T00:59:00.000Z" });
    const result = await new CaptureWorker({
      captures: new MemoryCaptureRepository([record]),
      processor,
      now,
    }).handle({ version: 1, captureId: record.id });
    expect(result?.status).toBe("processing");
    expect(processor).not.toHaveBeenCalled();
  });

  it("recovers a stale processing capture after a worker crash", async () => {
    const record = captureRecord({
      status: "processing",
      attempts: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const captures = new MemoryCaptureRepository([record]);
    const result = await new CaptureWorker({
      captures,
      processor: jest.fn().mockResolvedValue({ status: "ready", itemId: "item-1" }),
      now,
    }).handle({ version: 1, captureId: record.id });
    expect(result).toMatchObject({ status: "ready", attempts: 2, itemId: "item-1" });
  });

  it("rejects malformed queue messages and ignores missing captures", async () => {
    const worker = new CaptureWorker({
      captures: new MemoryCaptureRepository(),
      processor: jest.fn(),
      now,
    });
    await expect(
      worker.handle({ version: 2, captureId: "secret", extra: true })
    ).rejects.toMatchObject({
      name: "ZodError",
    });
    await expect(
      worker.handle({ version: 1, captureId: "10000000-0000-4000-8000-000000000099" })
    ).resolves.toBeUndefined();
  });
});

describe("default capture processor", () => {
  it("awaits durable pipeline work and resolves the canonical item", async () => {
    const item = { id: "item-1" };
    const items = { findByNormalizedUrl: jest.fn().mockResolvedValue(item) };
    const pipeline = jest.fn().mockResolvedValue({ rawContentId: "raw", status: "ready" });
    const processor = createDefaultCaptureProcessor({
      items: items as never,
      pipeline,
      fetchOptions: {
        resolve: publicDns,
        fetch: jest.fn().mockResolvedValue(
          new Response("<article>Readable</article>", {
            headers: { "content-type": "text/html" },
          })
        ),
      },
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    await expect(processor(captureRecord())).resolves.toEqual({
      status: "ready",
      itemId: "item-1",
    });
    expect(pipeline).toHaveBeenCalledWith(
      expect.objectContaining({ id: captureRecord().id, rawBody: expect.any(String) })
    );
  });

  it("never reports success without a durable item", async () => {
    const processor = createDefaultCaptureProcessor({
      items: { findByNormalizedUrl: jest.fn().mockResolvedValue(undefined) } as never,
      pipeline: jest.fn().mockResolvedValue({ rawContentId: "raw", status: "ready" }),
      fetchOptions: {
        resolve: publicDns,
        fetch: jest.fn().mockResolvedValue(
          new Response("<article>Readable</article>", {
            headers: { "content-type": "text/html" },
          })
        ),
      },
    });
    await expect(processor(captureRecord())).rejects.toMatchObject({
      code: "PROCESSING_FAILED",
      kind: "transient",
    });
  });
});
