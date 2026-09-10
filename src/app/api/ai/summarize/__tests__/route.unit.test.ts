jest.mock("@/lib/ai/summarize", () => ({ generateSummary: jest.fn() }));
jest.mock("@/lib/auth/tenant-route", () => ({
  requireTenantRoute: jest.fn(),
  tenantRouteFailureResponse: jest.fn(() => new Response(null, { status: 503 })),
}));
import { NextRequest } from "next/server";
import { POST } from "../route";
import { generateSummary } from "@/lib/ai/summarize";
import { requireTenantRoute } from "@/lib/auth/tenant-route";
import { AIProviderError } from "@/lib/ai/errors";
import { AIQuotaExceededError } from "@/lib/ai/router";
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(requireTenantRoute)
    .mockResolvedValue({
      context: {},
      repositories: {
        items: { findById: jest.fn().mockResolvedValue({ id: "one", url: "https://example.com" }) },
      },
    } as never);
});
const request = () =>
  new NextRequest("https://distil.test/api/ai/summarize", {
    method: "POST",
    body: JSON.stringify({ itemId: "one" }),
  });
it.each([
  "quota",
  "authentication",
  "invalid_request",
  "invalid_output",
  "timeout",
  "server",
  "unknown",
] as const)("returns safe actionable %s errors", async (category) => {
  jest.mocked(generateSummary).mockRejectedValue(new AIProviderError(category));
  const response = await POST(request());
  expect(response.status).toBe(category === "quota" ? 429 : 503);
  expect(await response.json()).toEqual({
    error: expect.any(String),
    code: `AI_${category.toUpperCase()}`,
  });
});
it("distinguishes tenant admission limits from provider errors", async () => {
  jest.mocked(generateSummary).mockRejectedValue(new AIQuotaExceededError("daily"));
  const response = await POST(request());
  expect(response.status).toBe(429);
  expect((await response.json()).code).toBe("AI_BUDGET");
});
it("keeps unexpected internal errors private", async () => {
  jest.mocked(generateSummary).mockRejectedValue(new Error("private credentials payload"));
  const response = await POST(request());
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Failed to generate summary" });
});
