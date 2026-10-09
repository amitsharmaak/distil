/**
 * An invalid optional ANTHROPIC_API_KEY must not break tasks that have a working
 * Gemini fallback; a bad Gemini key still surfaces as a configuration error.
 */
jest.mock("../providers", () => ({ createProviders: jest.fn() }));
jest.mock("../after-response", () => ({
  scheduleAIAfterResponse: (task: () => Promise<void>) => void task(),
}));
import { createProviders } from "../providers";
import { getRouter } from "../router";
import { aiLogger } from "@/lib/logger";
import { createAuthContext } from "@/lib/contracts/tenant-context";
import type { RepositorySet } from "@/lib/repositories/ports";

const context = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000001",
  actorId: "10000000-0000-4000-8000-000000000001",
  actorKind: "user",
  requestId: "30000000-0000-4000-8000-000000000001",
});
const anthropic = { name: "anthropic", generateJSON: jest.fn(), generateText: jest.fn() };
const gemini = { name: "gemini", generateJSON: jest.fn(), generateText: jest.fn() };
const unauthorized = () => Object.assign(new Error("invalid x-api-key secret"), { status: 401 });
const generated = (value: unknown) => ({ value, usage: { inputTokens: 11, outputTokens: 7 } });
const repos = {
  lifecycle: { consumeUsage: jest.fn() },
  agent: { insertAuditLog: jest.fn() },
} as unknown as RepositorySet;
let warn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.DISTIL_DAILY_AI_BUDGET;
  (globalThis as typeof globalThis & { __distilAIRouter?: unknown }).__distilAIRouter = undefined;
  jest.mocked(createProviders).mockReturnValue(
    new Map([
      ["gemini", gemini],
      ["anthropic", anthropic],
    ]) as never
  );
  jest.mocked(repos.lifecycle.consumeUsage).mockResolvedValue({ allowed: true } as never);
  warn = jest.spyOn(aiLogger, "warn").mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

it("falls back to Gemini when Anthropic rejects its key on summarize-complex", async () => {
  anthropic.generateJSON.mockRejectedValueOnce(unauthorized());
  gemini.generateJSON.mockResolvedValueOnce(generated({ overview: "ok" }));
  const result = await getRouter().generateTenantJSONWithMetadata(
    context,
    repos,
    "synthetic prompt",
    "summarize-complex"
  );
  expect(result).toEqual({
    value: { overview: "ok" },
    provider: "gemini",
    model: "gemini-3.5-flash",
  });
  expect(anthropic.generateJSON).toHaveBeenCalledWith(
    "synthetic prompt",
    "claude-sonnet-4-6",
    undefined
  );
  expect(gemini.generateJSON).toHaveBeenCalledWith(
    "synthetic prompt",
    "gemini-3.5-flash",
    undefined
  );
  expect(warn).toHaveBeenCalledWith(
    expect.objectContaining({
      event: "provider_auth_fallback",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      task: "summarize-complex",
      traceId: context.requestId,
    }),
    expect.any(String)
  );
  expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret/);
  expect(repos.agent.insertAuditLog).toHaveBeenCalledWith(
    expect.objectContaining({ provider: "gemini", model: "gemini-3.5-flash" })
  );
});

it("remembers the rejected key and skips Anthropic on later calls", async () => {
  anthropic.generateText.mockRejectedValueOnce(unauthorized());
  gemini.generateText.mockResolvedValue(generated("report"));
  await expect(
    getRouter().generateTenantText(context, repos, "p1", "research-synthesize")
  ).resolves.toBe("report");
  await expect(
    getRouter().generateTenantText(context, repos, "p2", "research-synthesize")
  ).resolves.toBe("report");
  expect(getRouter().getEffectiveModel("summarize-complex")).toEqual({
    provider: "gemini",
    model: "gemini-3.5-flash",
  });
  expect(anthropic.generateText).toHaveBeenCalledTimes(1);
  expect(gemini.generateText).toHaveBeenCalledTimes(2);
  expect(gemini.generateText).toHaveBeenLastCalledWith("p2", "gemini-3.5-flash", undefined);
  expect(warn.mock.calls.filter((c) => c[0]?.event === "provider_auth_rejected")).toHaveLength(1);
});

it("still surfaces a Gemini authentication failure as a configuration error", async () => {
  gemini.generateJSON.mockRejectedValueOnce(unauthorized());
  await expect(
    getRouter().generateTenantJSON(context, repos, "synthetic", "summarize")
  ).rejects.toMatchObject({ name: "AIProviderError", code: "AI_AUTHENTICATION" });
  expect(gemini.generateJSON).toHaveBeenCalledTimes(1);
  expect(anthropic.generateJSON).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
  // Gemini stays the effective provider for its own tasks.
  expect(getRouter().getEffectiveModel("summarize").provider).toBe("gemini");
});

it("denies the Gemini fallback when the tenant request budget is exhausted", async () => {
  anthropic.generateJSON.mockRejectedValueOnce(unauthorized());
  jest
    .mocked(repos.lifecycle.consumeUsage)
    .mockResolvedValueOnce({ allowed: true } as never)
    .mockResolvedValueOnce({ allowed: false } as never);
  await expect(
    getRouter().generateTenantJSON(context, repos, "synthetic", "summarize-complex")
  ).rejects.toMatchObject({ name: "AIQuotaExceededError" });
  expect(gemini.generateJSON).not.toHaveBeenCalled();
  expect(repos.lifecycle.consumeUsage).toHaveBeenCalledTimes(2);
  expect(repos.agent.insertAuditLog).not.toHaveBeenCalled();
});

it("does not reroute when no Gemini provider is registered", async () => {
  jest.mocked(createProviders).mockReturnValue(new Map([["anthropic", anthropic]]) as never);
  anthropic.generateJSON.mockRejectedValueOnce(unauthorized());
  await expect(
    getRouter().generateTenantJSON(context, repos, "synthetic", "summarize-complex")
  ).rejects.toMatchObject({ code: "AI_AUTHENTICATION" });
  expect(warn).not.toHaveBeenCalled();
});
