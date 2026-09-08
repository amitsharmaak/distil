import {
  createVercelCaptureDispatcher,
  FakeCaptureDispatcher,
  LocalCaptureDispatcher,
  VercelCaptureDispatcher,
} from "../dispatchers";
import { createCaptureQueueMessageV2 } from "@/lib/contracts/tenant-jobs";

jest.mock("@vercel/queue", () => ({ send: jest.fn().mockResolvedValue({ messageId: "queue-1" }) }));

const message = createCaptureQueueMessageV2({
  userId: "10000000-0000-4000-8000-000000000010",
  captureId: "10000000-0000-4000-8000-000000000001",
  traceId: "10000000-0000-4000-8000-000000000011",
});

describe("capture dispatchers", () => {
  it("deduplicates fake and local messages by idempotency key", async () => {
    const dispatcher = new FakeCaptureDispatcher();
    await dispatcher.dispatch(message, { idempotencyKey: message.captureId });
    await dispatcher.dispatch(message, { idempotencyKey: message.captureId });
    expect(dispatcher.messages).toHaveLength(1);
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

  it("creates the production dispatcher from the Vercel SDK", async () => {
    const dispatcher = await createVercelCaptureDispatcher();
    await expect(
      dispatcher.dispatch(message, { idempotencyKey: message.captureId })
    ).resolves.toBeUndefined();
  });
});
