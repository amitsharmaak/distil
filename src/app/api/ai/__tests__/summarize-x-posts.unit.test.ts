import { NextRequest } from "next/server";

const requireTenantRoute = jest.fn();
const generateSummary = jest.fn();
jest.mock("@/lib/auth/tenant-route", () => ({
  requireTenantRoute: (...args: unknown[]) => requireTenantRoute(...args),
  tenantRouteFailureResponse: () => Response.json({ error: "auth" }, { status: 401 }),
}));
jest.mock("@/lib/ai/summarize", () => ({
  generateSummary: (...args: unknown[]) => generateSummary(...args),
}));
jest.mock("@/lib/observability/request-metrics", () => ({
  withRequestMetrics: (handler: unknown) => handler,
}));

import { POST as summarize } from "../summarize/route";

const repositories = { items: { findById: jest.fn() } };

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/ai/summarize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  requireTenantRoute.mockResolvedValue({
    context: { userId: "tenant-a", actorKind: "user", actorId: "tenant-a", requestId: "request-a" },
    repositories,
  });
  generateSummary.mockResolvedValue({ summary: "s", cached: false });
});

it("refuses short X posts", async () => {
  repositories.items.findById.mockResolvedValue({
    id: "i",
    url: "https://x.com/a/status/1",
    fullContent: "Short tweet.",
  });
  const response = await summarize(request({ itemId: "i" }));
  expect(response.status).toBe(400);
  expect(generateSummary).not.toHaveBeenCalled();
});

it("summarises long-form X posts like articles", async () => {
  repositories.items.findById.mockResolvedValue({
    id: "i",
    url: "https://x.com/a/status/1",
    fullContent: "x".repeat(201),
  });
  const response = await summarize(request({ itemId: "i", length: "detailed" }));
  expect(response.status).toBe(200);
  expect(generateSummary).toHaveBeenCalledWith(
    expect.anything(),
    repositories,
    "i",
    expect.objectContaining({ length: "detailed" })
  );
});
