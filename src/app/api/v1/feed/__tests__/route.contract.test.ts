jest.mock("@/lib/auth/account-service", () => ({ resolveRequestAuthContext: jest.fn() }));
jest.mock("@/lib/database", () => ({
  withTenantRepositories: jest.fn(),
}));

import { GET } from "../route";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { AuthError } from "@/lib/auth/errors";
import { withTenantRepositories } from "@/lib/database";

const context = {
  userId: "11111111-1111-4111-8111-111111111111",
  actorKind: "user",
  actorId: "11111111-1111-4111-8111-111111111111",
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
} as never;
const list = jest.fn();
const getPreferences = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATABASE_URL = "postgres://test.example/distil";
  process.env.FEATURE_PERSONALIZATION = "true";
  jest.mocked(resolveRequestAuthContext).mockResolvedValue(context);
  list.mockResolvedValue({ items: [], nextCursor: "opaque" });
  getPreferences.mockResolvedValue({ personalizationEnabled: true });
  jest
    .mocked(withTenantRepositories)
    .mockImplementation(async (_context, operation) =>
      operation({ feed: { list }, digestExperience: { getPreferences } } as never)
    );
});

afterAll(() => {
  delete process.env.DATABASE_URL;
  delete process.env.FEATURE_PERSONALIZATION;
});

describe("GET /api/v1/feed contract", () => {
  it("requires tenant authentication before resolving repositories", async () => {
    jest
      .mocked(resolveRequestAuthContext)
      .mockRejectedValueOnce(new AuthError("UNAUTHORIZED", 401, "nope"));
    const response = await GET(new Request("https://distil.example/api/v1/feed"));
    expect(response.status).toBe(401);
    expect(withTenantRepositories).not.toHaveBeenCalled();
  });

  it("rejects invalid filter combinations without querying", async () => {
    const response = await GET(
      new Request(
        "https://distil.example/api/v1/feed?priority=urgent&dateFrom=2026-09-08T00:00:00.000Z&dateTo=2026-09-07T00:00:00.000Z"
      )
    );
    expect(response.status).toBe(400);
    expect(withTenantRepositories).not.toHaveBeenCalled();
  });

  it("accepts repeated facets and opens the caller-bound tenant transaction once", async () => {
    const response = await GET(
      new Request(
        "https://distil.example/api/v1/feed?topic=ai,product&topic=engineering&source=manual&source=publisher&sort=for_you&limit=30"
      )
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [], nextCursor: "opaque" });
    expect(resolveRequestAuthContext).toHaveBeenCalledTimes(1);
    expect(withTenantRepositories).toHaveBeenCalledTimes(1);
    expect(withTenantRepositories).toHaveBeenCalledWith(context, expect.any(Function));
    expect(getPreferences).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        topics: ["ai", "product", "engineering"],
        sources: ["manual", "publisher"],
        sort: "for_you",
        personalizationEnabled: true,
      })
    );
  });

  it("adds server-filtered 14-day resurfacing candidates in the same response", async () => {
    const priority = { items: [{ id: "priority" }] };
    const stale = { items: [{ id: "stale" }] };
    list.mockResolvedValueOnce(priority).mockResolvedValueOnce(stale);

    const response = await GET(
      new Request(
        "https://distil.example/api/v1/feed?sort=priority&read=false&limit=6&resurface=stale"
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: priority.items,
      resurfacedItems: stale.items,
    });
    expect(withTenantRepositories).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sort: "priority", read: false, limit: 6 })
    );
    expect(list).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sort: "recent",
        read: false,
        archive: "exclude",
        limit: 3,
        resurface: "stale",
      })
    );
  });
});
