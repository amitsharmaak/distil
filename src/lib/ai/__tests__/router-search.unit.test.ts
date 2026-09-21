jest.mock("../providers", () => ({ createProviders: jest.fn() }));
jest.mock("../after-response", () => ({ scheduleAIAfterResponse: jest.fn() }));

import { scheduleAIAfterResponse } from "../after-response";
import { GEMINI_SEARCH_MODEL } from "../ai-config";
import { AIProviderError } from "../errors";
import { createProviders } from "../providers";
import { createTenantAIRouter } from "../router";
import { createAuthContext } from "@/lib/contracts/tenant-context";
import type { RepositorySet } from "@/lib/repositories/ports";

const context = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000001",
  actorId: "10000000-0000-4000-8000-000000000001",
  actorKind: "user",
  requestId: "30000000-0000-4000-8000-000000000001",
});

function repositoriesWithBudget(): RepositorySet {
  return {
    lifecycle: { consumeUsage: jest.fn().mockResolvedValue({ allowed: true }) },
    agent: { insertAuditLog: jest.fn().mockResolvedValue(undefined) },
  } as unknown as RepositorySet;
}

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as typeof globalThis & { __distilAIRouter?: unknown }).__distilAIRouter = undefined;
});

it("routes the tenant facade to the Gemini search-grounded model with tenant accounting", async () => {
  const generateTextWithSearch = jest.fn().mockResolvedValue({
    value: "grounded answer https://example.com",
    usage: { inputTokens: 50, outputTokens: 20 },
  });
  const generateText = jest.fn();
  jest
    .mocked(createProviders)
    .mockReturnValue(
      new Map([
        [
          "gemini",
          { name: "gemini", generateText, generateJSON: jest.fn(), generateTextWithSearch },
        ],
      ]) as never
    );
  const repositories = repositoriesWithBudget();
  let deferred: (() => Promise<void>) | undefined;
  jest.mocked(scheduleAIAfterResponse).mockImplementation((task) => {
    deferred = task;
  });

  await expect(
    createTenantAIRouter(context, repositories).generateTextWithSearch("prompt", {
      timeoutMs: 45_000,
    })
  ).resolves.toBe("grounded answer https://example.com");

  expect(generateTextWithSearch).toHaveBeenCalledWith("prompt", { timeoutMs: 45_000 });
  expect(generateText).not.toHaveBeenCalled();
  expect(repositories.lifecycle.consumeUsage).toHaveBeenCalledTimes(1);
  await deferred?.();
  expect(repositories.agent.insertAuditLog).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "ai:research-search",
      provider: "gemini",
      model: GEMINI_SEARCH_MODEL,
      tokensIn: 50,
      tokensOut: 20,
      traceId: context.requestId,
    })
  );
  expect(repositories.lifecycle.consumeUsage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      operation: "ai.usage",
      provider: "gemini",
      inputTokens: 50,
      outputTokens: 20,
    })
  );
});

it("falls back to plain research-search routing when Gemini is not configured", async () => {
  const generateText = jest.fn().mockResolvedValue({
    value: "memory answer",
    usage: { inputTokens: 10, outputTokens: 5 },
  });
  jest
    .mocked(createProviders)
    .mockReturnValue(
      new Map([
        ["anthropic", { name: "anthropic", generateText, generateJSON: jest.fn() }],
      ]) as never
    );
  const repositories = repositoriesWithBudget();

  await expect(
    createTenantAIRouter(context, repositories).generateTextWithSearch("prompt", {
      timeoutMs: 45_000,
    })
  ).resolves.toBe("memory answer");

  expect(generateText).toHaveBeenCalledWith("prompt", "claude-haiku-4-5", { timeoutMs: 45_000 });
  expect(repositories.lifecycle.consumeUsage).toHaveBeenCalledTimes(1);
});

it("falls back to plain routing when grounding itself is refused for quota", async () => {
  const generateTextWithSearch = jest
    .fn()
    .mockRejectedValue(new AIProviderError("quota", "gemini", GEMINI_SEARCH_MODEL));
  const generateText = jest.fn().mockResolvedValue({
    value: "memory answer",
    usage: { inputTokens: 10, outputTokens: 5 },
  });
  jest
    .mocked(createProviders)
    .mockReturnValue(
      new Map([
        [
          "gemini",
          { name: "gemini", generateText, generateJSON: jest.fn(), generateTextWithSearch },
        ],
      ]) as never
    );
  const repositories = repositoriesWithBudget();

  await expect(
    createTenantAIRouter(context, repositories).generateTextWithSearch("prompt", { timeoutMs: 1 })
  ).resolves.toBe("memory answer");
  expect(generateText).toHaveBeenCalledWith("prompt", "gemini-3-flash-preview", { timeoutMs: 1 });
});

it("propagates timeouts from the grounded call so the stage is retried", async () => {
  const generateTextWithSearch = jest
    .fn()
    .mockRejectedValue(new AIProviderError("timeout", "gemini", GEMINI_SEARCH_MODEL));
  const generateText = jest.fn();
  jest
    .mocked(createProviders)
    .mockReturnValue(
      new Map([
        [
          "gemini",
          { name: "gemini", generateText, generateJSON: jest.fn(), generateTextWithSearch },
        ],
      ]) as never
    );
  await expect(
    createTenantAIRouter(context, repositoriesWithBudget()).generateTextWithSearch("prompt")
  ).rejects.toMatchObject({ category: "timeout" });
  expect(generateText).not.toHaveBeenCalled();
});

it("refuses the search call when the tenant budget is exhausted", async () => {
  const generateTextWithSearch = jest.fn();
  jest.mocked(createProviders).mockReturnValue(
    new Map([
      [
        "gemini",
        {
          name: "gemini",
          generateText: jest.fn(),
          generateJSON: jest.fn(),
          generateTextWithSearch,
        },
      ],
    ]) as never
  );
  const repositories = {
    lifecycle: { consumeUsage: jest.fn().mockResolvedValue({ allowed: false, reason: "quota" }) },
    agent: { insertAuditLog: jest.fn() },
  } as unknown as RepositorySet;

  await expect(
    createTenantAIRouter(context, repositories).generateTextWithSearch("prompt")
  ).rejects.toBeDefined();
  expect(generateTextWithSearch).not.toHaveBeenCalled();
});
