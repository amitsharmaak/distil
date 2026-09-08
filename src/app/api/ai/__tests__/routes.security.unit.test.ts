const requireTenantRoute = jest.fn();
const repositories = {
  items: { findById: jest.fn() },
  feedback: { insert: jest.fn() },
};

jest.mock("@/lib/auth/tenant-route", () => ({
  requireTenantRoute: (...args: unknown[]) => requireTenantRoute(...args),
  tenantRouteFailureResponse: () => Response.json({ error: "auth" }, { status: 503 }),
}));
jest.mock("@/lib/ai/summarize", () => ({ generateSummary: jest.fn() }));
jest.mock("@/lib/ai/preferences", () => ({ updatePreferencesFromFeedback: jest.fn() }));
jest.mock("@/lib/ai/prioritize", () => ({ reprioritize: jest.fn() }));

import { NextRequest } from "next/server";
import { POST as summarize } from "../summarize/route";
import { POST as feedback } from "../feedback/route";
import { generateSummary } from "@/lib/ai/summarize";

const mockGenerateSummary = generateSummary as jest.MockedFunction<typeof generateSummary>;

function request(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  requireTenantRoute.mockResolvedValue({
    context: {
      userId: "tenant-a",
      actorKind: "user",
      actorId: "tenant-a",
      requestId: "request-a",
    },
    repositories,
  });
});

it("does not expose provider errors from summary generation", async () => {
  repositories.items.findById.mockResolvedValue({ id: "item-1", url: "https://example.com" });
  mockGenerateSummary.mockRejectedValue(new Error("provider-secret-detail"));

  const response = await summarize(request("/api/ai/summarize", { itemId: "item-1" }));

  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Failed to generate summary" });
});

it("rejects oversized feedback reasons before reading or writing the database", async () => {
  const response = await feedback(
    request("/api/ai/feedback", { itemId: "item-1", rating: 1, reason: "x".repeat(1_001) })
  );

  expect(response.status).toBe(400);
  expect(repositories.items.findById).not.toHaveBeenCalled();
  expect(repositories.feedback.insert).not.toHaveBeenCalled();
});

it("rejects non-string feedback reasons", async () => {
  const response = await feedback(
    request("/api/ai/feedback", { itemId: "item-1", rating: 1, reason: { unsafe: true } })
  );

  expect(response.status).toBe(400);
  expect(repositories.items.findById).not.toHaveBeenCalled();
});
