import { FakeCaptureDispatcher } from "@/lib/queue/dispatchers";
import { CaptureService, QueueUnavailableError } from "../service";
import { captureRecord, context, MemoryCaptureRepository, publicDns } from "./fixtures";

const input = { url: "https://example.com/article", source: "web" as const };

describe("CaptureService", () => {
  it("persists a queued receipt before publishing its minimal message", async () => {
    const captures = new MemoryCaptureRepository();
    const dispatcher = new FakeCaptureDispatcher();
    const service = new CaptureService({
      context,
      captures,
      dispatcher,
      resolve: publicDns,
      id: () => "10000000-0000-4000-8000-000000000001",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    const result = await service.create(input);
    expect(result).toMatchObject({ duplicate: false, receipt: { status: "queued", attempts: 0 } });
    expect(captures.records.has(result.receipt.id)).toBe(true);
    expect(dispatcher.messages).toEqual([
      {
        message: {
          version: 2,
          userId: context.userId,
          captureId: result.receipt.id,
          traceId: context.requestId,
        },
        idempotencyKey: `${context.userId}:${result.receipt.id}`,
      },
    ]);
  });

  it("returns an active duplicate with 200 semantics without publishing", async () => {
    const captures = new MemoryCaptureRepository([captureRecord()]);
    const dispatcher = new FakeCaptureDispatcher();
    const result = await new CaptureService({
      context,
      captures,
      dispatcher,
      resolve: publicDns,
    }).create(input);
    expect(result.duplicate).toBe(true);
    expect(dispatcher.messages).toHaveLength(0);
  });

  it("resolves a concurrent uniqueness race to the winning receipt", async () => {
    const winner = captureRecord();
    const captures = new MemoryCaptureRepository();
    captures.failCreate = true;
    jest
      .spyOn(captures, "findActiveOrReadyByNormalizedUrl")
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(winner);
    const result = await new CaptureService({
      context,
      captures,
      dispatcher: new FakeCaptureDispatcher(),
      resolve: publicDns,
    }).create(input);
    expect(result).toEqual({
      receipt: expect.objectContaining({ id: winner.id }),
      duplicate: true,
    });
  });

  it("records a retryable failure and throws when publication fails", async () => {
    const captures = new MemoryCaptureRepository();
    const dispatcher = new FakeCaptureDispatcher();
    dispatcher.failure = new Error("queue offline");
    const service = new CaptureService({
      context,
      captures,
      dispatcher,
      resolve: publicDns,
      id: () => "10000000-0000-4000-8000-000000000001",
    });
    await expect(service.create(input)).rejects.toMatchObject({
      name: "QueueUnavailableError",
      receipt: { status: "failed", retryable: true, error: { code: "QUEUE_UNAVAILABLE" } },
    });
  });

  it("requeues only retryable failed captures and republishes", async () => {
    const failed = captureRecord({ status: "failed", retryable: true });
    const captures = new MemoryCaptureRepository([failed]);
    const dispatcher = new FakeCaptureDispatcher();
    const receipt = await new CaptureService({ context, captures, dispatcher }).retry(failed.id);
    expect(receipt.status).toBe("queued");
    expect(dispatcher.messages[0].idempotencyKey).toBe(`${context.userId}:${failed.id}`);
  });

  it("preserves retryability when retry publication fails", async () => {
    const failed = captureRecord({ status: "failed", retryable: true });
    const captures = new MemoryCaptureRepository([failed]);
    const dispatcher = new FakeCaptureDispatcher();
    dispatcher.failure = new Error("offline");
    await expect(
      new CaptureService({ context, captures, dispatcher }).retry(failed.id)
    ).rejects.toBeInstanceOf(QueueUnavailableError);
    expect((await captures.findById(failed.id))?.status).toBe("failed");
    expect((await captures.findById(failed.id))?.retryable).toBe(true);
  });

  it("rejects explicit retry for ready, rejected, queued, processing and non-retryable failed states", async () => {
    for (const status of ["ready", "rejected", "queued", "processing", "failed"] as const) {
      const record = captureRecord({ status, retryable: false });
      await expect(
        new CaptureService({
          context,
          captures: new MemoryCaptureRepository([record]),
          dispatcher: new FakeCaptureDispatcher(),
        }).retry(record.id)
      ).rejects.toMatchObject({ name: "CaptureNotRetryableError" });
    }
  });

  it("returns individual receipts, clamps list limits, and reports missing captures", async () => {
    const record = captureRecord();
    const captures = new MemoryCaptureRepository([record]);
    const list = jest.spyOn(captures, "list");
    const service = new CaptureService({
      context,
      captures,
      dispatcher: new FakeCaptureDispatcher(),
    });
    await expect(service.get(record.id)).resolves.toMatchObject({ id: record.id });
    await expect(service.get("missing")).rejects.toMatchObject({ name: "CaptureNotFoundError" });
    await service.list(1_000);
    expect(list).toHaveBeenCalledWith(100);
    await service.list();
    expect(list).toHaveBeenLastCalledWith(50);
  });

  it("renders optional item and error receipt fields including the fallback message", async () => {
    const record = captureRecord({
      status: "failed",
      itemId: "item-1",
      lastErrorCode: "PROCESSING_FAILED",
      lastErrorMessage: undefined,
    });
    const receipt = await new CaptureService({
      context,
      captures: new MemoryCaptureRepository([record]),
      dispatcher: new FakeCaptureDispatcher(),
    }).get(record.id);
    expect(receipt).toMatchObject({
      itemId: "item-1",
      error: { code: "PROCESSING_FAILED", message: "Capture processing failed" },
    });
  });

  it("rethrows a uniqueness failure when no winning capture exists", async () => {
    const captures = new MemoryCaptureRepository();
    captures.failCreate = true;
    await expect(
      new CaptureService({
        context,
        captures,
        dispatcher: new FakeCaptureDispatcher(),
        resolve: publicDns,
      }).create(input)
    ).rejects.toThrow("unique constraint");
  });

  it("reports missing captures during retry", async () => {
    await expect(
      new CaptureService({
        context,
        captures: new MemoryCaptureRepository(),
        dispatcher: new FakeCaptureDispatcher(),
      }).retry("missing")
    ).rejects.toMatchObject({ name: "CaptureNotFoundError" });
  });
});
