jest.mock("@/lib/auth/route-helpers", () => ({ requireSessionMutation: jest.fn() }));
jest.mock("@/lib/postgres/client", () => ({ createPostgresClient: jest.fn() }));
jest.mock("@/lib/knowledge/retrieval", () => ({ PostgresPassageSearchStore: jest.fn() }));
jest.mock("@/lib/knowledge/service", () => {
  const actual = jest.requireActual("@/lib/knowledge/service");
  return { ...actual, answerFromKnowledge: jest.fn() };
});

import { AuthError } from "@/lib/auth/errors";
import { requireSessionMutation } from "@/lib/auth/route-helpers";
import { answerFromKnowledge } from "@/lib/knowledge/service";
import { createPostgresClient } from "@/lib/postgres/client";
import { POST } from "../route";

const sql = { end: jest.fn() };
const request = (body: unknown) =>
  new Request("https://distil.example/api/v1/answers", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://distil.example" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATABASE_URL = "postgres://test.example/distil";
  process.env.FEATURE_ANSWERS = "true";
  jest.mocked(requireSessionMutation).mockResolvedValue();
  jest.mocked(createPostgresClient).mockReturnValue(sql as never);
  jest.mocked(answerFromKnowledge).mockResolvedValue({
    status: "abstained",
    intent: "specific",
    answer: "Not enough evidence",
    citations: [],
    passagesUsed: 0,
    retrievalMode: "keyword",
    degradation: [],
  });
});

afterAll(() => {
  delete process.env.DATABASE_URL;
  delete process.env.FEATURE_ANSWERS;
});

describe("POST /api/v1/answers security", () => {
  it("rejects a disallowed origin before parsing or opening storage", async () => {
    jest
      .mocked(requireSessionMutation)
      .mockRejectedValueOnce(new AuthError("ORIGIN_NOT_ALLOWED", 403, "not allowed"));
    const response = await POST(request({ query: "What is saved?" }));
    expect(response.status).toBe(403);
    expect(createPostgresClient).not.toHaveBeenCalled();
  });

  it("rejects unknown fields and more than six context messages", async () => {
    const unknown = await POST(request({ query: "What is saved?", admin: true }));
    expect(unknown.status).toBe(400);
    const messages = Array.from({ length: 7 }, (_, index) => ({
      role: "user",
      content: `message ${index}`,
    }));
    const tooMany = await POST(request({ query: "What is saved?", messages }));
    expect(tooMany.status).toBe(400);
    expect(createPostgresClient).not.toHaveBeenCalled();
  });

  it("stops before opening PostgreSQL when answers are disabled", async () => {
    delete process.env.FEATURE_ANSWERS;
    const response = await POST(request({ query: "What is saved?" }));
    expect(response.status).toBe(503);
    expect(createPostgresClient).not.toHaveBeenCalled();
  });

  it("returns the grounded service envelope", async () => {
    const response = await POST(
      request({ query: "What is saved?", messages: [{ role: "user", content: "Earlier" }] })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "abstained", citations: [] });
    expect(answerFromKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ query: "What is saved?" }),
      })
    );
  });
});
