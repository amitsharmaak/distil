jest.mock("@/lib/auth/account-service", () => ({ resolveRequestAuthContext: jest.fn() }));
jest.mock("@/lib/database", () => ({ getTenantRepositories: jest.fn() }));
jest.mock("@/lib/knowledge/retrieval", () => ({ searchPassages: jest.fn() }));

import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { AuthError } from "@/lib/auth/errors";
import { getTenantRepositories } from "@/lib/database";
import { searchPassages } from "@/lib/knowledge/retrieval";
import { GET } from "../route";

const context = {
  userId: "11111111-1111-4111-8111-111111111111",
  actorKind: "user",
  actorId: "11111111-1111-4111-8111-111111111111",
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
} as never;
const passages = { search: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATABASE_URL = "postgres://test.example/distil";
  process.env.FEATURE_SEARCH = "true";
  jest.mocked(resolveRequestAuthContext).mockResolvedValue(context);
  jest.mocked(getTenantRepositories).mockResolvedValue({ passages } as never);
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
  it("authenticates before resolving tenant repositories", async () => {
    jest
      .mocked(resolveRequestAuthContext)
      .mockRejectedValueOnce(new AuthError("UNAUTHORIZED", 401, "unauthorized"));
    const response = await GET(new Request("https://distil.example/api/v1/search?q=durable"));
    expect(response.status).toBe(401);
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });

  it("stops before resolving tenant repositories when search is disabled", async () => {
    delete process.env.FEATURE_SEARCH;
    const response = await GET(new Request("https://distil.example/api/v1/search?q=durable"));
    expect(response.status).toBe(503);
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });

  it("rejects unknown parameters before querying", async () => {
    const response = await GET(
      new Request("https://distil.example/api/v1/search?q=durable&unexpected=true")
    );
    expect(response.status).toBe(400);
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });

  it("passes repeated facets to tenant passage retrieval", async () => {
    const response = await GET(
      new Request(
        "https://distil.example/api/v1/search?q=durable+queue&topic=ai,systems&source=manual&priority=high&limit=5"
      )
    );
    expect(response.status).toBe(200);
    expect(getTenantRepositories).toHaveBeenCalledWith(context);
    expect(searchPassages).toHaveBeenCalledWith(
      passages,
      expect.objectContaining({
        query: "durable queue",
        topics: ["ai", "systems"],
        sources: ["manual"],
        priorities: ["high"],
        limit: 5,
      })
    );
  });

  it.each([
    "q=x",
    "q=valid&read=maybe",
    "q=valid&dateFrom=2026-02-02T00:00:00.000Z&dateTo=2026-02-01T00:00:00.000Z",
  ])("rejects invalid query: %s", async (query) => {
    const response = await GET(new Request(`https://distil.example/api/v1/search?${query}`));
    expect(response.status).toBe(400);
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });

  it("stops before querying when PostgreSQL is unavailable", async () => {
    delete process.env.DATABASE_URL;
    const response = await GET(new Request("https://distil.example/api/v1/search?q=durable"));
    expect(response.status).toBe(503);
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });

  it("returns a safe failure when tenant retrieval fails", async () => {
    jest.mocked(searchPassages).mockRejectedValueOnce(new Error("database unavailable"));
    const response = await GET(new Request("https://distil.example/api/v1/search?q=durable"));
    expect(response.status).toBe(500);
  });
});
