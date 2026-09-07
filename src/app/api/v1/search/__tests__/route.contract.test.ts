jest.mock("@/lib/auth/route-helpers", () => ({ requireRequestSession: jest.fn() }));
jest.mock("@/lib/postgres/client", () => ({ createPostgresClient: jest.fn() }));
jest.mock("@/lib/knowledge/retrieval", () => ({
  PostgresPassageSearchStore: jest.fn(),
  searchPassages: jest.fn(),
}));

import { requireRequestSession } from "@/lib/auth/route-helpers";
import { AuthError } from "@/lib/auth/errors";
import { searchPassages } from "@/lib/knowledge/retrieval";
import { createPostgresClient } from "@/lib/postgres/client";
import { GET } from "../route";

const sql = { end: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATABASE_URL = "postgres://test.example/distil";
  process.env.FEATURE_SEARCH = "true";
  jest.mocked(requireRequestSession).mockResolvedValue();
  jest.mocked(createPostgresClient).mockReturnValue(sql as never);
  jest.mocked(searchPassages).mockResolvedValue({
    query: "durable queue",
    results: [],
    retrievalMode: "keyword",
    degradation: [],
  });
});

afterAll(() => {
  delete process.env.DATABASE_URL;
  delete process.env.FEATURE_SEARCH;
});

describe("GET /api/v1/search", () => {
  it("authenticates before opening PostgreSQL", async () => {
    jest
      .mocked(requireRequestSession)
      .mockRejectedValueOnce(new AuthError("UNAUTHORIZED", 401, "unauthorized"));
    const response = await GET(new Request("https://distil.example/api/v1/search?q=durable"));
    expect(response.status).toBe(401);
    expect(createPostgresClient).not.toHaveBeenCalled();
  });

  it("stops before opening PostgreSQL when search is disabled", async () => {
    delete process.env.FEATURE_SEARCH;
    const response = await GET(new Request("https://distil.example/api/v1/search?q=durable"));
    expect(response.status).toBe(503);
    expect(createPostgresClient).not.toHaveBeenCalled();
  });

  it("rejects unknown parameters before querying", async () => {
    const response = await GET(
      new Request("https://distil.example/api/v1/search?q=durable&unexpected=true")
    );
    expect(response.status).toBe(400);
    expect(createPostgresClient).not.toHaveBeenCalled();
  });

  it("passes repeated facets to passage retrieval and closes the client", async () => {
    const response = await GET(
      new Request(
        "https://distil.example/api/v1/search?q=durable+queue&topic=ai,systems&source=manual&priority=high&limit=5"
      )
    );
    expect(response.status).toBe(200);
    expect(searchPassages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        query: "durable queue",
        topics: ["ai", "systems"],
        sources: ["manual"],
        priorities: ["high"],
        limit: 5,
      })
    );
    expect(sql.end).toHaveBeenCalledWith({ timeout: 5 });
  });

  it.each([
    "q=x",
    "q=valid&read=maybe",
    "q=valid&dateFrom=2026-02-02T00:00:00.000Z&dateTo=2026-02-01T00:00:00.000Z",
  ])("rejects invalid query: %s", async (query) => {
    const response = await GET(new Request(`https://distil.example/api/v1/search?${query}`));
    expect(response.status).toBe(400);
    expect(createPostgresClient).not.toHaveBeenCalled();
  });

  it("stops before querying when PostgreSQL is unavailable", async () => {
    delete process.env.DATABASE_URL;
    const response = await GET(new Request("https://distil.example/api/v1/search?q=durable"));
    expect(response.status).toBe(503);
    expect(createPostgresClient).not.toHaveBeenCalled();
  });

  it("closes PostgreSQL when retrieval fails", async () => {
    jest.mocked(searchPassages).mockRejectedValueOnce(new Error("database unavailable"));
    const response = await GET(new Request("https://distil.example/api/v1/search?q=durable"));
    expect(response.status).toBe(500);
    expect(sql.end).toHaveBeenCalledWith({ timeout: 5 });
  });
});
