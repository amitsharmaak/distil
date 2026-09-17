jest.mock("../providers", () => ({ createProviders: jest.fn() }));
jest.mock("../after-response", () => ({ scheduleAIAfterResponse: jest.fn() }));

import { scheduleAIAfterResponse } from "../after-response";
import { createProviders } from "../providers";
import { getRouter } from "../router";
import { createAuthContext } from "@/lib/contracts/tenant-context";
import type { RepositorySet } from "@/lib/repositories/ports";

const context = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000001",
  actorId: "10000000-0000-4000-8000-000000000001",
  actorKind: "user",
  requestId: "30000000-0000-4000-8000-000000000001",
});

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as typeof globalThis & { __distilAIRouter?: unknown }).__distilAIRouter = undefined;
});

it("returns after one admission check and defers audit plus measured-token accounting", async () => {
  jest.mocked(createProviders).mockReturnValue(
    new Map([
      [
        "gemini",
        {
          name: "gemini",
          generateText: jest.fn().mockResolvedValue({
            value: "answer",
            usage: { inputTokens: 123, outputTokens: 45 },
          }),
          generateJSON: jest.fn(),
        },
      ],
    ]) as never
  );
  const repositories = {
    lifecycle: { consumeUsage: jest.fn().mockResolvedValue({ allowed: true }) },
    agent: { insertAuditLog: jest.fn().mockResolvedValue(undefined) },
  } as unknown as RepositorySet;
  let deferred: (() => Promise<void>) | undefined;
  jest.mocked(scheduleAIAfterResponse).mockImplementation((task) => {
    deferred = task;
  });

  await expect(
    getRouter().generateTenantText(context, repositories, "prompt", "knowledge-answer")
  ).resolves.toBe("answer");

  expect(repositories.lifecycle.consumeUsage).toHaveBeenCalledTimes(1);
  expect(repositories.agent.insertAuditLog).not.toHaveBeenCalled();
  await deferred?.();
  expect(repositories.agent.insertAuditLog).toHaveBeenCalledWith(
    expect.objectContaining({ tokensIn: 123, tokensOut: 45 })
  );
  expect(repositories.lifecycle.consumeUsage).toHaveBeenLastCalledWith(
    expect.objectContaining({ operation: "ai.usage", inputTokens: 123, outputTokens: 45 })
  );
});
