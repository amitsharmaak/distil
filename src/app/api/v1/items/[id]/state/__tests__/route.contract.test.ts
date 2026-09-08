jest.mock("@/lib/auth/account-service", () => ({ resolveRequestAuthContext: jest.fn() }));
jest.mock("@/lib/auth/origin", () => ({ requireAllowedOrigin: jest.fn() }));
jest.mock("@/lib/database", () => ({ getTenantRepositories: jest.fn() }));

import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { AuthError } from "@/lib/auth/errors";
import { getTenantRepositories } from "@/lib/database";
import { GET, PATCH } from "../route";

const auth = {
  userId: "11111111-1111-4111-8111-111111111111",
  actorKind: "user",
  actorId: "11111111-1111-4111-8111-111111111111",
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
} as never;
const item = {
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
};
const repositories = {
  items: {
    findById: jest.fn(),
    update: jest.fn(),
  },
  itemEvents: { append: jest.fn() },
};

describe("PATCH /api/v1/items/:id/state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(resolveRequestAuthContext).mockResolvedValue(auth);
    jest.mocked(getTenantRepositories).mockResolvedValue(repositories as never);
    repositories.items.findById.mockResolvedValue(item as never);
    repositories.items.update.mockImplementation(async (_id, patch) => ({ ...item, ...patch }));
    repositories.itemEvents.append.mockResolvedValue(undefined);
  });

  it("rejects unknown fields before tenant repository access", async () => {
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
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });

  it("updates state through the caller-bound repository", async () => {
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
    expect(getTenantRepositories).toHaveBeenCalledWith(auth);
  });

  it("returns reader state from the caller-bound repository", async () => {
    const response = await GET(new Request("http://localhost/api/v1/items/item-1/state"), {
      params: Promise.resolve({ id: "item-1" }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      state: { isRead: false, archived: false, archivedAt: null, readAt: null, readingProgress: 0 },
    });
    expect(resolveRequestAuthContext).toHaveBeenCalled();
    expect(getTenantRepositories).toHaveBeenCalledWith(auth);
  });

  it("returns 404 for an id hidden by tenant storage", async () => {
    repositories.items.findById.mockResolvedValueOnce(undefined);
    const missing = await GET(new Request("http://localhost/api/v1/items/foreign/state"), {
      params: Promise.resolve({ id: "foreign" }),
    });
    expect(missing.status).toBe(404);
  });

  it("maps authentication failures without opening tenant storage", async () => {
    jest
      .mocked(resolveRequestAuthContext)
      .mockRejectedValueOnce(new AuthError("UNAUTHORIZED", 401, "Authentication required"));
    const response = await GET(new Request("http://localhost/api/v1/items/item-1/state"), {
      params: Promise.resolve({ id: "item-1" }),
    });
    expect(response.status).toBe(401);
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });
});
