jest.mock("@vercel/queue", () => ({
  handleCallback: jest.fn((handler: (message: unknown) => Promise<void>) => handler),
}));

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { handleCallback } from "@vercel/queue";

import {
  createLifecycleQueueMessageHandler,
  maxDuration,
  preferredRegion,
  runtime,
} from "../route";

const message = {
  version: 1 as const,
  userId: "10000000-0000-4000-8000-000000000010",
  jobId: "20000000-0000-4000-8000-000000000020",
  jobType: "account.export",
  traceId: "30000000-0000-4000-8000-000000000030",
};

describe("account-lifecycle queue callback", () => {
  it("registers the production callback with a bounded lease in Singapore", () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(60);
    expect(preferredRegion).toBe("sin1");
    expect(handleCallback).toHaveBeenCalledWith(expect.any(Function), {
      visibilityTimeoutSeconds: 60,
    });
  });

  it("registers the dedicated lifecycle queue trigger", () => {
    const vercel = JSON.parse(readFileSync(resolve("vercel.json"), "utf8")) as {
      functions: Record<string, { experimentalTriggers: Array<Record<string, unknown>> }>;
    };
    expect(vercel.functions["src/app/api/queue/account-lifecycle/route.ts"]).toEqual({
      maxDuration: 60,
      experimentalTriggers: [
        {
          type: "queue/v2beta",
          topic: "account-lifecycle",
          retryAfterSeconds: 60,
          initialDelaySeconds: 0,
        },
      ],
    });
  });

  it("rejects invalid envelopes before they reach the lifecycle runtime", async () => {
    const consume = jest.fn();
    await expect(
      createLifecycleQueueMessageHandler(consume)({ ...message, userId: "not-a-uuid" })
    ).rejects.toBeDefined();
    expect(consume).not.toHaveBeenCalled();
  });

  it("retries only real handler failures and acknowledges rejected work", async () => {
    const failure = jest.fn().mockResolvedValue("failed");
    await expect(createLifecycleQueueMessageHandler(failure)(message)).rejects.toThrow(
      "account_lifecycle_job_failed"
    );

    const rejected = jest.fn().mockResolvedValue("rejected");
    await expect(createLifecycleQueueMessageHandler(rejected)(message)).resolves.toBeUndefined();
    const unsupported = jest.fn().mockResolvedValue("unsupported");
    await expect(createLifecycleQueueMessageHandler(unsupported)(message)).resolves.toBeUndefined();
  });
});
