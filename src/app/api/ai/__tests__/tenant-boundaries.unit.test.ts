import { NextRequest } from "next/server";

const requireTenantRoute = jest.fn();
jest.mock("@/lib/auth/tenant-route", () => ({
  requireTenantRoute: (...args: unknown[]) => requireTenantRoute(...args),
  tenantRouteFailureResponse: () => Response.json({ error: "auth" }, { status: 401 }),
}));
jest.mock("@/lib/ai/summarize", () => ({ generateSummary: jest.fn() }));

import { POST as feedback } from "../feedback/route";

const repositories = {
  items: { findById: jest.fn() },
  feedback: { insert: jest.fn() },
};

function request(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
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
});

it("returns 404 before feedback persistence when an item is outside the tenant", async () => {
  repositories.items.findById.mockResolvedValue(undefined);

  const response = await feedback(
    request("/api/ai/feedback", { itemId: "tenant-b-item", rating: 1 })
  );

  expect(response.status).toBe(404);
  expect(repositories.feedback.insert).not.toHaveBeenCalled();
});
