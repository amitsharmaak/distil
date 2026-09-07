jest.mock("@/lib/auth/route-helpers", () => ({
  requireRequestSession: jest.fn().mockResolvedValue(undefined),
  requireSessionMutation: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/database", () => ({ getRepositorySet: jest.fn() }));

import { requireRequestSession } from "@/lib/auth/route-helpers";
import { getRepositorySet } from "@/lib/database";
import { GET, PATCH } from "../route";

const repositories = {
  items: {
    findById: jest.fn().mockResolvedValue({
      id: "item-1",
      title: "Article",
      summary: "Summary",
      sourceType: "manual",
      contentType: "article",
      topics: [],
      url: "https://example.com",
      priority: "medium",
      isRead: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      readingProgress: 0,
    }),
    update: jest.fn().mockImplementation(async (_id, patch) => ({
      id: "item-1",
      title: "Article",
      summary: "Summary",
      sourceType: "manual",
      contentType: "article",
      topics: [],
      url: "https://example.com",
      priority: "medium",
      isRead: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      readingProgress: 0,
      ...patch,
    })),
  },
  itemEvents: { append: jest.fn().mockResolvedValue(undefined) },
};

describe("PATCH /api/v1/items/:id/state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getRepositorySet as jest.Mock).mockResolvedValue(repositories);
  });

  it("rejects unknown fields with a stable 400 error", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/v1/items/item-1/state", {
        method: "PATCH",
        body: JSON.stringify({ isRead: true, title: "not allowed" }),
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      }),
      { params: Promise.resolve({ id: "item-1" }) }
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INVALID_REQUEST" } });
  });

  it("updates state after authentication and returns the item", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/v1/items/item-1/state", {
        method: "PATCH",
        body: JSON.stringify({ isRead: true }),
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      }),
      { params: Promise.resolve({ id: "item-1" }) }
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toHaveProperty("item.id", "item-1");
  });

  it("returns the reader state for an existing item", async () => {
    const response = await GET(new Request("http://localhost/api/v1/items/item-1/state"), {
      params: Promise.resolve({ id: "item-1" }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      state: { isRead: false, archived: false, archivedAt: null, readAt: null, readingProgress: 0 },
    });
    expect(requireRequestSession).toHaveBeenCalled();
  });

  it("returns not found and handles missing ids on GET/PATCH", async () => {
    repositories.items.findById.mockResolvedValueOnce(null);
    const missing = await GET(new Request("http://localhost/api/v1/items/missing/state"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(missing.status).toBe(404);

    const invalid = await PATCH(
      new Request("http://localhost/api/v1/items/state", {
        method: "PATCH",
        body: JSON.stringify({ isRead: true }),
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      }),
      { params: Promise.resolve({ id: "" }) }
    );
    expect(invalid.status).toBe(500);
  });

  it("maps authentication failures to the route error response", async () => {
    jest.mocked(requireRequestSession).mockRejectedValueOnce(new Error("unauthorized"));
    const response = await GET(new Request("http://localhost/api/v1/items/item-1/state"), {
      params: Promise.resolve({ id: "item-1" }),
    });
    expect(response.status).toBe(500);
  });
});
