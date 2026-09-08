/**
 * Contract tests for POST /api/agent/chat and GET /api/agent/chat.
 *
 * The RAG pipeline and DB calls are mocked so tests run without a live DB or
 * Gemini API key. We verify that the route correctly delegates to ragQuery,
 * persists the conversation, and returns the right response shape.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

const requireTenantRoute = jest.fn();
const repositories = {
  agent: {
    insertConversation: jest.fn().mockResolvedValue(undefined),
    insertMessage: jest.fn().mockResolvedValue(undefined),
    listMessages: jest.fn().mockResolvedValue([]),
    listConversations: jest.fn().mockResolvedValue([]),
  },
};

jest.mock("@/lib/auth/tenant-route", () => ({
  requireTenantRoute: (...args: unknown[]) => requireTenantRoute(...args),
  tenantRouteFailureResponse: () => Response.json({ error: "auth" }, { status: 503 }),
}));

jest.mock("@/lib/agent/rag", () => ({
  ragQuery: jest.fn(),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { GET, POST } from "../route";
import { ragQuery } from "@/lib/agent/rag";
import type { RAGResult } from "@/lib/agent/rag";

const mockRagQuery = ragQuery as jest.MockedFunction<typeof ragQuery>;
const mockInsertConversation = repositories.agent.insertConversation;
const mockInsertMessage = repositories.agent.insertMessage;
const mockListMessages = repositories.agent.listMessages;
const mockListConversations = repositories.agent.listConversations;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(
  url: string,
  options?: ConstructorParameters<typeof NextRequest>[1]
): NextRequest {
  return new NextRequest(url, options);
}

function makeRagResult(overrides: Partial<RAGResult> = {}): RAGResult {
  return {
    answer: "Here are your saved articles.",
    citations: [
      { id: "item-1", title: "Test Article", url: "https://example.com/1", sourceType: "manual" },
    ],
    chunksUsed: 3,
    totalTokensEstimate: 500,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  requireTenantRoute.mockResolvedValue({
    context: {
      userId: "tenant-a",
      actorKind: "user",
      actorId: "tenant-a",
      requestId: "request-a",
    },
    repositories,
  });
  mockRagQuery.mockResolvedValue(makeRagResult());
  mockListMessages.mockResolvedValue([]);
  mockListConversations.mockResolvedValue([]);
});

// ── POST /api/agent/chat ──────────────────────────────────────────────────────

describe("POST /api/agent/chat", () => {
  it("returns 400 when message field is missing", async () => {
    const req = makeRequest("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/message/i);
  });

  it("returns 400 when message is an empty string", async () => {
    const req = makeRequest("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "   " }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON body", async () => {
    const req = makeRequest("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-valid-json",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("rejects oversized messages before persisting or invoking AI", async () => {
    const req = makeRequest("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "x".repeat(20_001) }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(mockInsertMessage).not.toHaveBeenCalled();
    expect(mockRagQuery).not.toHaveBeenCalled();
  });

  it("rejects malformed conversation identifiers", async () => {
    const req = makeRequest("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello", conversationId: { invalid: true } }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(mockInsertMessage).not.toHaveBeenCalled();
  });

  it("returns 200 with answer, citations, and chunksUsed", async () => {
    const req = makeRequest("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "what articles do you have" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.answer).toBe("Here are your saved articles.");
    expect(body.citations).toHaveLength(1);
    expect(body.chunksUsed).toBe(3);
    expect(body.conversationId).toBeDefined();
  });

  it("calls ragQuery with the user message", async () => {
    const req = makeRequest("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "what articles do you have" }),
    });

    await POST(req);

    expect(mockRagQuery).toHaveBeenCalledWith(
      expect.anything(),
      repositories,
      "what articles do you have"
    );
  });

  it("creates a new conversation when no conversationId is provided", async () => {
    const req = makeRequest("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });

    await POST(req);

    expect(mockInsertConversation).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.any(String) })
    );
  });

  it("reuses an existing conversationId when provided", async () => {
    const existingId = "existing-conv-123";
    mockListConversations.mockResolvedValue([{ id: existingId }]);
    const req = makeRequest("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "follow-up question", conversationId: existingId }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(body.conversationId).toBe(existingId);
    // No new conversation should be created
    expect(mockInsertConversation).not.toHaveBeenCalled();
  });

  it("persists both the user message and assistant reply", async () => {
    const req = makeRequest("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "show me recent articles" }),
    });

    await POST(req);

    expect(mockInsertMessage).toHaveBeenCalledTimes(2);

    const calls = mockInsertMessage.mock.calls;
    const roles = calls.map((c) => (c[0] as { role: string }).role);
    expect(roles).toContain("user");
    expect(roles).toContain("assistant");
  });

  it("returns 200 with empty citations when library is empty", async () => {
    mockRagQuery.mockResolvedValue({
      answer: "Your library is empty right now.",
      citations: [],
      chunksUsed: 0,
      totalTokensEstimate: 0,
    });

    const req = makeRequest("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "what articles do you have" }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.citations).toEqual([]);
    expect(body.chunksUsed).toBe(0);
  });

  it("returns 500 when ragQuery throws an unexpected error", async () => {
    mockRagQuery.mockRejectedValue(new Error("Unexpected failure"));

    const req = makeRequest("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "what articles do you have" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("waits for message persistence and reports an asynchronous DB failure", async () => {
    mockInsertMessage.mockRejectedValueOnce(new Error("DB write failed"));
    const req = makeRequest("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "save this conversation" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(500);
    expect(mockRagQuery).not.toHaveBeenCalled();
  });
});

// ── GET /api/agent/chat ───────────────────────────────────────────────────────

describe("GET /api/agent/chat", () => {
  it("rejects oversized conversation identifiers", async () => {
    const req = makeRequest(
      `http://localhost:3000/api/agent/chat?conversationId=${"x".repeat(129)}`
    );

    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(mockListMessages).not.toHaveBeenCalled();
  });

  it("returns messages for a given conversationId", async () => {
    const mockMessages = [
      { id: "msg-1", role: "user", content: "hello", created_at: new Date().toISOString() },
      {
        id: "msg-2",
        role: "assistant",
        content: "Hi there!",
        created_at: new Date().toISOString(),
      },
    ];
    mockListMessages.mockResolvedValue(mockMessages);

    const req = makeRequest("http://localhost:3000/api/agent/chat?conversationId=conv-123");

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.messages).toHaveLength(2);
    expect(mockListMessages).toHaveBeenCalledWith("conv-123");
  });

  it("returns all conversations when no conversationId is provided", async () => {
    const mockConvs = [{ id: "conv-1", title: "First chat", created_at: new Date().toISOString() }];
    mockListConversations.mockResolvedValue(mockConvs);

    const req = makeRequest("http://localhost:3000/api/agent/chat");

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.conversations).toHaveLength(1);
    expect(mockListMessages).not.toHaveBeenCalled();
  });

  it("returns 500 when an asynchronous DB lookup rejects", async () => {
    mockListConversations.mockRejectedValueOnce(new Error("DB error"));

    const req = makeRequest("http://localhost:3000/api/agent/chat");

    const res = await GET(req);

    expect(res.status).toBe(500);
  });
});
