jest.mock("@vercel/queue", () => ({
  handleCallback: jest.fn((handler: (message: unknown) => Promise<void>) => handler),
}));

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { handleCallback } from "@vercel/queue";
import { ResearchStageRetryError } from "@/lib/ai/research";
import {
  createResearchQueueMessageHandler,
  maxDuration,
  preferredRegion,
  researchQueueRetry,
  runtime,
} from "../route";

const reportId = "a1b2c3d4-e5f6-4789-a123-456789abcdef";
const userId = "10000000-0000-4000-8000-000000000010";
const traceId = "10000000-0000-4000-8000-000000000011";
const message = {
  version: 1 as const,
  userId,
  reportId,
  traceId,
  step: "search" as const,
  index: 2,
};

describe("research-runs queue callback", () => {
  it("uses the Node runtime and a Hobby-compatible callback lease in Singapore", () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(60);
    expect(preferredRegion).toBe("sin1");
    expect(handleCallback).toHaveBeenCalledWith(expect.any(Function), {
      visibilityTimeoutSeconds: 60,
      retry: researchQueueRetry,
    });
  });

  it("reschedules a retryable stage after 60 s and leaves other failures to the platform", () => {
    expect(
      researchQueueRetry(new ResearchStageRetryError("search:1", 1, new Error("503")))
    ).toEqual({ afterSeconds: 60 });
    expect(researchQueueRetry(new Error("parse failure"))).toBeUndefined();
  });

  it("registers the research topic trigger in Vercel configuration", () => {
    const vercel = JSON.parse(readFileSync(resolve("vercel.json"), "utf8")) as {
      functions: Record<
        string,
        { maxDuration: number; experimentalTriggers: Array<Record<string, unknown>> }
      >;
    };
    expect(vercel.functions["src/app/api/queue/research-runs/route.ts"]).toEqual({
      maxDuration: 60,
      experimentalTriggers: [
        {
          type: "queue/v2beta",
          topic: "research-runs",
          retryAfterSeconds: 60,
          initialDelaySeconds: 0,
        },
      ],
    });
  });

  it("validates and awaits a versioned research stage message", async () => {
    const consume = jest.fn(async () => undefined);
    await createResearchQueueMessageHandler(consume)(message);
    expect(consume).toHaveBeenCalledWith(message);
  });

  it.each([
    ["unknown message version", { ...message, version: 2 }],
    ["non-UUID report id", { ...message, reportId: "report-1" }],
    ["unknown stage", { ...message, step: "publish" }],
    ["negative stage index", { ...message, index: -1 }],
    ["unexpected fields", { ...message, token: "must-not-be-queued" }],
  ])("rejects %s before invoking the worker", async (_label, message) => {
    const consume = jest.fn(async () => undefined);
    await expect(createResearchQueueMessageHandler(consume)(message)).rejects.toBeDefined();
    expect(consume).not.toHaveBeenCalled();
  });

  it("propagates stage failures so Vercel can redeliver the message", async () => {
    const failure = new Error("transient stage failure");
    const consume = jest.fn(async () => {
      throw failure;
    });
    await expect(createResearchQueueMessageHandler(consume)(message)).rejects.toBe(failure);
  });
});
