jest.mock("../providers", () => ({ createProviders: jest.fn() }));
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
const generateJSON = jest.fn();
const repos = {
  lifecycle: { consumeUsage: jest.fn() },
  agent: { insertAuditLog: jest.fn() },
} as unknown as RepositorySet;
beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.DISTIL_DAILY_AI_BUDGET;
  delete process.env.DISTIL_ROLLING_30D_AI_BUDGET;
  (globalThis as typeof globalThis & { __distilAIRouter?: unknown }).__distilAIRouter = undefined;
  jest
    .mocked(createProviders)
    .mockReturnValue(
      new Map([["gemini", { name: "gemini", generateJSON, generateText: jest.fn() }]])
    );
  jest.mocked(repos.lifecycle.consumeUsage).mockResolvedValue({ allowed: true } as never);
});
it("falls back on summary quota, checks tenant admission again, and audits the successful model", async () => {
  generateJSON
    .mockRejectedValueOnce(Object.assign(new Error("private provider payload"), { status: 429 }))
    .mockResolvedValueOnce({ overview: "ok", keyPoints: ["one"] });
  const result = await getRouter().generateTenantJSONWithMetadata(
    context,
    repos,
    "synthetic prompt",
    "summarize"
  );
  expect(generateJSON.mock.calls.map((c) => c[1])).toEqual([
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
  ]);
  expect(result.model).toBe("gemini-3.1-flash-lite");
  expect(repos.lifecycle.consumeUsage).toHaveBeenCalledTimes(3);
  expect(repos.agent.insertAuditLog).toHaveBeenCalledWith(
    expect.objectContaining({ model: result.model, traceId: context.requestId })
  );
});
it.each([401, 403, 400])("does not retry authentication or request errors (%s)", async (status) => {
  generateJSON.mockRejectedValueOnce(Object.assign(new Error("secret=example"), { status }));
  await expect(
    getRouter().generateTenantJSON(context, repos, "synthetic", "summarize")
  ).rejects.toMatchObject({ code: status === 400 ? "AI_INVALID_REQUEST" : "AI_AUTHENTICATION" });
  expect(generateJSON).toHaveBeenCalledTimes(1);
  expect(repos.agent.insertAuditLog).not.toHaveBeenCalled();
});
it("does not fall back for unrelated tasks", async () => {
  generateJSON.mockRejectedValueOnce(Object.assign(new Error("quota"), { status: 429 }));
  await expect(
    getRouter().generateTenantJSON(context, repos, "synthetic", "auto-tag")
  ).rejects.toMatchObject({ code: "AI_QUOTA" });
  expect(generateJSON).toHaveBeenCalledTimes(1);
});
it("denies fallback when tenant request budget is exhausted", async () => {
  generateJSON.mockRejectedValueOnce(Object.assign(new Error("quota"), { status: 429 }));
  jest
    .mocked(repos.lifecycle.consumeUsage)
    .mockResolvedValueOnce({ allowed: true } as never)
    .mockResolvedValueOnce({ allowed: false } as never);
  await expect(
    getRouter().generateTenantJSON(context, repos, "synthetic", "summarize")
  ).rejects.toMatchObject({ name: "AIQuotaExceededError" });
  expect(generateJSON).toHaveBeenCalledTimes(1);
});
it("returns the normalized fallback failure without a third attempt", async () => {
  generateJSON.mockRejectedValue(Object.assign(new Error("private payload"), { status: 429 }));
  await expect(
    getRouter().generateTenantJSON(context, repos, "synthetic", "summarize-complex")
  ).rejects.toMatchObject({ code: "AI_QUOTA", model: "gemini-3.1-flash-lite" });
  expect(generateJSON).toHaveBeenCalledTimes(2);
});

it.each([503, 504])("falls back for a temporary model failure (%s)", async (status) => {
  generateJSON
    .mockRejectedValueOnce(Object.assign(new Error("temporary"), { status }))
    .mockResolvedValueOnce({ overview: "ok", keyPoints: ["one"] });
  expect(
    (await getRouter().generateTenantJSONWithMetadata(context, repos, "synthetic", "summarize"))
      .model
  ).toBe("gemini-3.1-flash-lite");
});

it("accounts for fallback tokens at the accepted model rates", async () => {
  const output = { overview: "ok", keyPoints: ["one"] };
  generateJSON
    .mockRejectedValueOnce(Object.assign(new Error("quota"), { status: 429 }))
    .mockResolvedValueOnce(output);
  await getRouter().generateTenantJSON(context, repos, "synthetic", "summarize");
  const cost =
    (Math.ceil("synthetic".length / 4) * 0.25 +
      Math.ceil(JSON.stringify(output).length / 4) * 1.5) /
    1_000_000;
  expect(repos.agent.insertAuditLog).toHaveBeenCalledWith(
    expect.objectContaining({ cost: expect.closeTo(cost, 12) })
  );
  expect(repos.lifecycle.consumeUsage).toHaveBeenLastCalledWith(
    expect.objectContaining({ costMicrousd: Math.round(cost * 1_000_000) })
  );
});
