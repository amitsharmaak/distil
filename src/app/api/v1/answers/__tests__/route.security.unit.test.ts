jest.mock("@/lib/auth/account-service", () => ({ resolveRequestAuthContext: jest.fn() }));
jest.mock("@/lib/auth/origin", () => ({ requireAllowedOrigin: jest.fn() }));
jest.mock("@/lib/database", () => ({ getTenantRepositories: jest.fn() }));
jest.mock("@/lib/knowledge/service", () => {
  const actual = jest.requireActual("@/lib/knowledge/service");
  return { ...actual, answerFromKnowledge: jest.fn() };
});

import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { AuthError } from "@/lib/auth/errors";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getTenantRepositories } from "@/lib/database";
import { answerFromKnowledge } from "@/lib/knowledge/service";
import { POST } from "../route";

const context = {
  userId: "11111111-1111-4111-8111-111111111111",
  actorKind: "user",
  actorId: "11111111-1111-4111-8111-111111111111",
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
} as never;
const passages = { search: jest.fn() };
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
  jest.mocked(resolveRequestAuthContext).mockResolvedValue(context);
  jest.mocked(getTenantRepositories).mockResolvedValue({ passages } as never);
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
  it("rejects a disallowed origin before authentication or storage", async () => {
    jest.mocked(requireAllowedOrigin).mockImplementationOnce(() => {
      throw new AuthError("ORIGIN_NOT_ALLOWED", 403, "not allowed");
    });
    const response = await POST(request({ query: "What is saved?" }));
    expect(response.status).toBe(403);
    expect(resolveRequestAuthContext).not.toHaveBeenCalled();
    expect(getTenantRepositories).not.toHaveBeenCalled();
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
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });

  it("stops before resolving tenant storage when answers are disabled", async () => {
    delete process.env.FEATURE_ANSWERS;
    const response = await POST(request({ query: "What is saved?" }));
    expect(response.status).toBe(503);
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });

  it("passes caller context and its bound passage store to the grounded service", async () => {
    const response = await POST(
      request({ query: "What is saved?", messages: [{ role: "user", content: "Earlier" }] })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "abstained", citations: [] });
    expect(answerFromKnowledge).toHaveBeenCalledWith({
      context,
      request: expect.objectContaining({ query: "What is saved?" }),
      store: passages,
    });
  });
});
