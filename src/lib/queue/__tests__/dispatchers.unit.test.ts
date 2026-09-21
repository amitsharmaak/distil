import {
  createVercelCaptureDispatcher,
  createVercelResearchDispatcher,
  createVercelTenantJobDispatcher,
  FakeCaptureDispatcher,
  FakeTenantJobDispatcher,
  InlineCaptureDispatcher,
  InlineResearchDispatcher,
  LocalCaptureDispatcher,
  type ResearchDispatcher,
  VercelCaptureDispatcher,
  VercelResearchDispatcher,
  VercelTenantJobDispatcher,
} from "../dispatchers";
import { CaptureRetryScheduledError } from "@/lib/capture/errors";
import {
  createCaptureQueueMessageV2,
  createResearchRunMessageV1,
  createTenantJobEnvelopeV1,
  type CaptureQueueMessageV2,
  type ResearchRunMessageV1,
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
  it("runs the inline consumer after the dispatch call returns, with a detached copy", async () => {
    const consume = jest.fn<Promise<void>, [CaptureQueueMessageV2]>(async () => undefined);
    const dispatcher = new InlineCaptureDispatcher(consume);
    await dispatcher.dispatch(message, { idempotencyKey: message.captureId });
    expect(consume).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume.mock.calls[0][0]).toEqual(message);
    expect(consume.mock.calls[0][0]).not.toBe(message);
  });

  it("reports inline consumer failures to the error hook instead of the request", async () => {
    const failure = new Error("fetch failed");
    const onError = jest.fn();
    const dispatcher = new InlineCaptureDispatcher(async () => {
      throw failure;
    }, onError);
    await expect(
      dispatcher.dispatch(message, { idempotencyKey: message.captureId })
    ).resolves.toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("redelivers the inline message when the worker schedules a retry", async () => {
    const onError = jest.fn();
    const consume = jest
      .fn<Promise<void>, [CaptureQueueMessageV2]>()
      .mockRejectedValueOnce(new CaptureRetryScheduledError(message.captureId))
      .mockResolvedValueOnce(undefined);
    const dispatcher = new InlineCaptureDispatcher(consume, onError, 1);
    await dispatcher.dispatch(message, { idempotencyKey: message.captureId });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(consume).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  });

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

describe("research dispatchers", () => {
  const researchMessage = createResearchRunMessageV1({
    userId: "10000000-0000-4000-8000-000000000010",
    reportId: "10000000-0000-4000-8000-000000000013",
    traceId: "10000000-0000-4000-8000-000000000011",
    step: "search",
    index: 0,
  });

  it("publishes stage messages to the research-runs topic in Singapore", async () => {
    const sender = jest.fn().mockResolvedValue(undefined);
    await new VercelResearchDispatcher(sender).dispatch(researchMessage, {
      idempotencyKey: "research:key",
    });
    expect(sender).toHaveBeenCalledWith("research-runs", researchMessage, {
      idempotencyKey: "research:key",
      region: "sin1",
    });
    const dispatcher = await createVercelResearchDispatcher();
    expect(dispatcher).toBeInstanceOf(VercelResearchDispatcher);
  });

  it("runs the inline consumer detached from the dispatch call", async () => {
    const consume = jest.fn<Promise<void>, [ResearchRunMessageV1]>(async () => undefined);
    const dispatcher: ResearchDispatcher = new InlineResearchDispatcher(consume);
    await dispatcher.dispatch(researchMessage, { idempotencyKey: "research:key" });
    expect(consume).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume.mock.calls[0][0]).toEqual(researchMessage);
    expect(consume.mock.calls[0][0]).not.toBe(researchMessage);
  });

  it("redelivers a thrown inline stage a bounded number of times, then reports the error", async () => {
    const failure = new Error("stage failed");
    const consume = jest.fn<Promise<void>, [ResearchRunMessageV1]>(async () => {
      throw failure;
    });
    const onError = jest.fn();
    const dispatcher: ResearchDispatcher = new InlineResearchDispatcher(consume, onError, 1, 3);
    await dispatcher.dispatch(researchMessage, { idempotencyKey: "research:key" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(consume).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledWith(failure);
  });
});
