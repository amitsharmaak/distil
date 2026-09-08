import {
  createVercelCaptureDispatcher,
  createVercelTenantJobDispatcher,
  FakeCaptureDispatcher,
  FakeTenantJobDispatcher,
  LocalCaptureDispatcher,
  VercelCaptureDispatcher,
  VercelTenantJobDispatcher,
} from "../dispatchers";
import {
  createCaptureQueueMessageV2,
  createTenantJobEnvelopeV1,
} from "@/lib/contracts/tenant-jobs";

jest.mock("@vercel/queue", () => ({ send: jest.fn().mockResolvedValue({ messageId: "queue-1" }) }));

const message = createCaptureQueueMessageV2({
  userId: "10000000-0000-4000-8000-000000000010",
  captureId: "10000000-0000-4000-8000-000000000001",
  traceId: "10000000-0000-4000-8000-000000000011",
});
const lifecycleMessage = createTenantJobEnvelopeV1({
  userId: "10000000-0000-4000-8000-000000000010",
  jobId: "10000000-0000-4000-8000-000000000012",
  jobType: "account.export",
  traceId: "10000000-0000-4000-8000-000000000011",
});

describe("capture dispatchers", () => {
  it("deduplicates fake and local messages by idempotency key", async () => {
    const dispatcher = new FakeCaptureDispatcher();
    await dispatcher.dispatch(message, { idempotencyKey: message.captureId });
    await dispatcher.dispatch(message, { idempotencyKey: message.captureId });
    expect(dispatcher.messages).toHaveLength(1);
  });

  it("propagates explicit fake-dispatch failures without queueing either message type", async () => {
    const failure = new Error("queue unavailable");
    const capture = new FakeCaptureDispatcher();
    capture.failure = failure;
    await expect(capture.dispatch(message, { idempotencyKey: message.captureId })).rejects.toBe(
      failure
    );
    expect(capture.messages).toEqual([]);

    const lifecycle = new FakeTenantJobDispatcher();
    lifecycle.failure = failure;
    await expect(
      lifecycle.dispatch(lifecycleMessage, { idempotencyKey: "account-export:failure" })
    ).rejects.toBe(failure);
    expect(lifecycle.messages).toEqual([]);
  });

  it("drains local messages synchronously without fire-and-forget work", async () => {
    const dispatcher = new LocalCaptureDispatcher();
    const handler = jest.fn().mockResolvedValue(undefined);
    await dispatcher.dispatch(message, { idempotencyKey: message.captureId });
    await dispatcher.drain(handler);
    expect(handler).toHaveBeenCalledWith(message);
    expect(dispatcher.messages).toHaveLength(0);
  });

  it("publishes to Vercel with the minimal message, Singapore region, and idempotency key", async () => {
    const sender = jest.fn().mockResolvedValue({ messageId: "queue-1" });
    await new VercelCaptureDispatcher(sender).dispatch(message, {
      idempotencyKey: message.captureId,
    });
    expect(sender).toHaveBeenCalledWith("capture-requests", message, {
      idempotencyKey: message.captureId,
      region: "sin1",
    });
    expect(Object.keys(sender.mock.calls[0][1])).toEqual([
      "version",
      "userId",
      "captureId",
      "traceId",
    ]);
  });

  it("uses an explicitly configured region for capture delivery", async () => {
    const sender = jest.fn().mockResolvedValue({ messageId: "queue-1" });
    await new VercelCaptureDispatcher(sender, "iad1").dispatch(message, {
      idempotencyKey: message.captureId,
    });
    expect(sender).toHaveBeenCalledWith("capture-requests", message, {
      idempotencyKey: message.captureId,
      region: "iad1",
    });
  });

  it("creates the production dispatcher from the Vercel SDK", async () => {
    const dispatcher = await createVercelCaptureDispatcher();
    await expect(
      dispatcher.dispatch(message, { idempotencyKey: message.captureId })
    ).resolves.toBeUndefined();
  });

  it("publishes lifecycle envelopes to their dedicated topic with delayed delivery", async () => {
    const sender = jest.fn().mockResolvedValue({ messageId: "queue-1" });
    await new VercelTenantJobDispatcher(sender).dispatch(lifecycleMessage, {
      idempotencyKey: "account-export:one",
      delaySeconds: 42,
    });
    expect(sender).toHaveBeenCalledWith("account-lifecycle", lifecycleMessage, {
      idempotencyKey: "account-export:one",
      region: "sin1",
      delaySeconds: 42,
    });
  });

  it("omits delay for immediate lifecycle delivery and honors an explicit region", async () => {
    const sender = jest.fn().mockResolvedValue({ messageId: "queue-1" });
    await new VercelTenantJobDispatcher(sender, "iad1").dispatch(lifecycleMessage, {
      idempotencyKey: "account-export:immediate",
    });
    expect(sender).toHaveBeenCalledWith("account-lifecycle", lifecycleMessage, {
      idempotencyKey: "account-export:immediate",
      region: "iad1",
    });
  });

  it("deduplicates test lifecycle dispatches by idempotency key", async () => {
    const dispatcher = new FakeTenantJobDispatcher();
    await dispatcher.dispatch(lifecycleMessage, { idempotencyKey: "account-export:one" });
    await dispatcher.dispatch(lifecycleMessage, { idempotencyKey: "account-export:one" });
    expect(dispatcher.messages).toEqual([
      expect.objectContaining({ message: lifecycleMessage, idempotencyKey: "account-export:one" }),
    ]);
  });

  it("omits delay from fake lifecycle messages when no schedule is requested", async () => {
    const dispatcher = new FakeTenantJobDispatcher();
    await dispatcher.dispatch(lifecycleMessage, { idempotencyKey: "account-export:immediate" });
    expect(dispatcher.messages).toEqual([
      {
        message: lifecycleMessage,
        idempotencyKey: "account-export:immediate",
      },
    ]);
  });

  it("creates the lifecycle production dispatcher from the Vercel SDK", async () => {
    const dispatcher = await createVercelTenantJobDispatcher();
    await expect(
      dispatcher.dispatch(lifecycleMessage, { idempotencyKey: "account-export:one" })
    ).resolves.toBeUndefined();
  });
});
