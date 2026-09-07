jest.mock("@/lib/auth/route-helpers", () => ({ requireRequestSession: jest.fn() }));
jest.mock("@/lib/postgres/client", () => ({ createPostgresClient: jest.fn() }));
jest.mock("@/lib/feed/feed-query", () => ({
  FeedQueryError: class FeedQueryError extends Error {},
  PostgresFeedQuery: jest.fn(),
}));

import { GET } from "../route";
import { requireRequestSession } from "@/lib/auth/route-helpers";
import { createPostgresClient } from "@/lib/postgres/client";
import { PostgresFeedQuery } from "@/lib/feed/feed-query";

const mockSession = requireRequestSession as jest.MockedFunction<typeof requireRequestSession>;
const mockClient = createPostgresClient as jest.MockedFunction<typeof createPostgresClient>;
const mockFeedQuery = PostgresFeedQuery as jest.MockedClass<typeof PostgresFeedQuery>;
const sql = { end: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATABASE_URL = "postgres://test.example/distil";
  mockClient.mockReturnValue(sql as never);
  mockFeedQuery.mockImplementation(() => ({ list: jest.fn() }) as never);
});

afterAll(() => delete process.env.DATABASE_URL);

describe("GET /api/v1/feed contract", () => {
  it("requires the web session before opening PostgreSQL", async () => {
    mockSession.mockRejectedValueOnce(Object.assign(new Error("nope"), { status: 401 }));
    const response = await GET(new Request("https://distil.example/api/v1/feed"));
    expect(response.status).toBe(401);
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("rejects invalid filter combinations without querying", async () => {
    mockSession.mockResolvedValueOnce();
    const response = await GET(
      new Request(
        "https://distil.example/api/v1/feed?priority=urgent&dateFrom=2026-09-08T00:00:00.000Z&dateTo=2026-09-07T00:00:00.000Z"
      )
    );
    expect(response.status).toBe(400);
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("accepts repeated or comma-separated facet filters and returns the cursor envelope", async () => {
    mockSession.mockResolvedValueOnce();
    const list = jest.fn().mockResolvedValue({ items: [], nextCursor: "opaque" });
    mockFeedQuery.mockImplementation(() => ({ list }) as never);
    const response = await GET(
      new Request(
        "https://distil.example/api/v1/feed?topic=ai,product&topic=engineering&source=manual&source=publisher&sort=for_you&limit=30"
      )
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [], nextCursor: "opaque" });
    expect(mockSession).toHaveBeenCalledTimes(1);
  });
});
