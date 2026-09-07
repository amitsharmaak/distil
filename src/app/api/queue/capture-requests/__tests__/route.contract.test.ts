jest.mock("@vercel/queue", () => ({
  handleCallback: jest.fn((handler: (message: unknown) => Promise<void>) => handler),
}));

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { handleCallback } from "@vercel/queue";
import { createCaptureQueueMessageHandler, maxDuration, preferredRegion, runtime } from "../route";

const captureId = "a1b2c3d4-e5f6-4789-a123-456789abcdef";

describe("capture-requests queue callback", () => {
  it("uses the Node runtime and a Hobby-compatible callback lease in Singapore", () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(60);
    expect(preferredRegion).toBe("sin1");
    expect(handleCallback).toHaveBeenCalledWith(expect.any(Function), {
      visibilityTimeoutSeconds: 60,
    });
  });

  it("registers exactly one capture topic trigger in Vercel configuration", () => {
    const vercel = JSON.parse(readFileSync(resolve("vercel.json"), "utf8")) as {
      regions: string[];
      functions: Record<
        string,
        { maxDuration: number; experimentalTriggers: Array<Record<string, unknown>> }
      >;
    };
    expect(vercel.regions).toEqual(["sin1"]);
    expect(vercel.functions).toEqual({
      "src/app/api/queue/capture-requests/route.ts": {
        maxDuration: 60,
        experimentalTriggers: [
          {
            type: "queue/v2beta",
            topic: "capture-requests",
            retryAfterSeconds: 60,
            initialDelaySeconds: 0,
          },
        ],
      },
    });
  });

  it("validates and awaits a versioned capture message", async () => {
    const consume = jest.fn<Promise<void>, [{ version: 1; captureId: string }]>(
      async () => undefined
    );
    await createCaptureQueueMessageHandler(consume)({ version: 1, captureId });
    expect(consume).toHaveBeenCalledWith({ version: 1, captureId });
  });

  it.each([
    ["unknown message version", { version: 2, captureId }],
    ["non-UUID capture id", { version: 1, captureId: "capture-1" }],
    ["unexpected fields", { version: 1, captureId, token: "must-not-be-queued" }],
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
    await expect(createCaptureQueueMessageHandler(consume)({ version: 1, captureId })).rejects.toBe(
      failure
    );
  });
});
