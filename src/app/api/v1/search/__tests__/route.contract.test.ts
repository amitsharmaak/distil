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
  jest.mocked(requireRequestSession).mockResolvedValue();
  jest.mocked(createPostgresClient).mockReturnValue(sql as never);
  jest.mocked(searchPassages).mockResolvedValue({
    query: "durable queue",
    results: [],
    retrievalMode: "keyword",
    degradation: [],
  });
});

afterAll(() => delete process.env.DATABASE_URL);

describe("GET /api/v1/search", () => {
  it("authenticates before opening PostgreSQL", async () => {
    jest
      .mocked(requireRequestSession)
      .mockRejectedValueOnce(new AuthError("UNAUTHORIZED", 401, "unauthorized"));
    const response = await GET(new Request("https://distil.example/api/v1/search?q=durable"));
    expect(response.status).toBe(401);
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
});
