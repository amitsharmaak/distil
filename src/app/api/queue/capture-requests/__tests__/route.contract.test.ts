jest.mock("@vercel/queue", () => ({
  handleCallback: jest.fn((handler: (message: unknown) => Promise<void>) => handler),
}));

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { handleCallback } from "@vercel/queue";
import { createCaptureQueueMessageHandler, maxDuration, preferredRegion, runtime } from "../route";

const captureId = "a1b2c3d4-e5f6-4789-a123-456789abcdef";
const userId = "10000000-0000-4000-8000-000000000010";
const traceId = "10000000-0000-4000-8000-000000000011";
const message = { version: 2 as const, userId, captureId, traceId };

describe("capture-requests queue callback", () => {
  beforeEach(() => {
    delete process.env.DISTIL_LEGACY_CAPTURE_QUEUE_V1;
    delete process.env.DISTIL_LEGACY_USER_ID;
  });
  it("uses the Node runtime and a Hobby-compatible callback lease in Singapore", () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(60);
    expect(preferredRegion).toBe("sin1");
    expect(handleCallback).toHaveBeenCalledWith(expect.any(Function), {
      visibilityTimeoutSeconds: 60,
    });
  });

  it("registers the capture topic trigger in Vercel configuration", () => {
    const vercel = JSON.parse(readFileSync(resolve("vercel.json"), "utf8")) as {
      regions: string[];
      functions: Record<
        string,
        { maxDuration: number; experimentalTriggers: Array<Record<string, unknown>> }
      >;
    };
    expect(vercel.regions).toEqual(["sin1"]);
    expect(vercel.functions["src/app/api/queue/capture-requests/route.ts"]).toEqual({
      maxDuration: 60,
      experimentalTriggers: [
        {
          type: "queue/v2beta",
          topic: "capture-requests",
          retryAfterSeconds: 60,
          initialDelaySeconds: 0,
        },
      ],
    });
  });

  it("validates and awaits a versioned capture message", async () => {
    const consume = jest.fn(async () => undefined);
    await createCaptureQueueMessageHandler(consume)(message);
    expect(consume).toHaveBeenCalledWith(message);
  });

  it.each([
    ["unknown message version", { ...message, version: 3 }],
    ["non-UUID capture id", { ...message, captureId: "capture-1" }],
    ["unexpected fields", { ...message, token: "must-not-be-queued" }],
  ])("rejects %s before invoking the worker", async (_label, message) => {
    const consume = jest.fn(async () => undefined);
    await expect(createCaptureQueueMessageHandler(consume)(message)).rejects.toBeDefined();
    expect(consume).not.toHaveBeenCalled();
  });

  it("propagates worker failures so Vercel can redeliver the message", async () => {
    const failure = new Error("transient processing failure");
    const consume = jest.fn(async () => {
      throw failure;
    });
    await expect(createCaptureQueueMessageHandler(consume)(message)).rejects.toBe(failure);
  });

  it("maps legacy V1 only to the configured Amit owner behind the removable flag", async () => {
    process.env.DISTIL_LEGACY_CAPTURE_QUEUE_V1 = "true";
    process.env.DISTIL_LEGACY_USER_ID = userId;
    const consume = jest.fn(async () => undefined);
    await createCaptureQueueMessageHandler(consume)({ version: 1, captureId });
    expect(consume).toHaveBeenCalledWith(
      expect.objectContaining({ version: 2, userId, captureId, traceId: expect.any(String) })
    );
  });
});
