/**
 * Contract tests for POST /api/agent/chat and GET /api/agent/chat.
 *
 * The RAG pipeline and DB calls are mocked so tests run without a live DB or
 * Gemini API key. We verify that the route correctly delegates to ragQuery,
 * persists the conversation, and returns the right response shape.
 */

process.env.DB_PATH = ":memory:";

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("@/lib/agent/rag", () => ({
  ragQuery: jest.fn(),
}));

jest.mock("@/lib/database", () => ({
  insertChatConversation: jest.fn().mockResolvedValue(undefined),
  insertChatMessage: jest.fn().mockResolvedValue(undefined),
  getChatMessages: jest.fn().mockResolvedValue([]),
  getChatConversations: jest.fn().mockResolvedValue([]),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { GET, POST } from "../route";
import { ragQuery } from "@/lib/agent/rag";
import {
  insertChatConversation,
  insertChatMessage,
  getChatMessages,
  getChatConversations,
} from "@/lib/database";
import type { RAGResult } from "@/lib/agent/rag";

const mockRagQuery = ragQuery as jest.MockedFunction<typeof ragQuery>;
const mockGetChatMessages = getChatMessages as unknown as jest.MockedFunction<
  (
    ...args: Parameters<typeof getChatMessages>
  ) => Promise<Awaited<ReturnType<typeof getChatMessages>>>
>;
const mockGetChatConversations = getChatConversations as unknown as jest.MockedFunction<
  (
    ...args: Parameters<typeof getChatConversations>
  ) => Promise<Awaited<ReturnType<typeof getChatConversations>>>
>;
const mockInsertChatConversation = insertChatConversation as unknown as jest.MockedFunction<
  (
    ...args: Parameters<typeof insertChatConversation>
  ) => Promise<Awaited<ReturnType<typeof insertChatConversation>>>
>;
const mockInsertChatMessage = insertChatMessage as unknown as jest.MockedFunction<
  (
    ...args: Parameters<typeof insertChatMessage>
  ) => Promise<Awaited<ReturnType<typeof insertChatMessage>>>
>;

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
  mockRagQuery.mockResolvedValue(makeRagResult());
  mockGetChatMessages.mockResolvedValue([]);
  mockGetChatConversations.mockResolvedValue([]);
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

    expect(mockRagQuery).toHaveBeenCalledWith("what articles do you have");
  });

  it("creates a new conversation when no conversationId is provided", async () => {
    const req = makeRequest("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });

    await POST(req);

    expect(mockInsertChatConversation).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.any(String) })
    );
  });

  it("reuses an existing conversationId when provided", async () => {
    const existingId = "existing-conv-123";
    const req = makeRequest("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "follow-up question", conversationId: existingId }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(body.conversationId).toBe(existingId);
    // No new conversation should be created
    expect(mockInsertChatConversation).not.toHaveBeenCalled();
  });

  it("persists both the user message and assistant reply", async () => {
    const req = makeRequest("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "show me recent articles" }),
    });

    await POST(req);

    expect(mockInsertChatMessage).toHaveBeenCalledTimes(2);

    const calls = mockInsertChatMessage.mock.calls;
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
    mockInsertChatMessage.mockRejectedValueOnce(new Error("DB write failed"));
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
    mockGetChatMessages.mockResolvedValue(
      mockMessages as Awaited<ReturnType<typeof getChatMessages>>
    );

    const req = makeRequest("http://localhost:3000/api/agent/chat?conversationId=conv-123");

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.messages).toHaveLength(2);
    expect(mockGetChatMessages).toHaveBeenCalledWith("conv-123");
  });

  it("returns all conversations when no conversationId is provided", async () => {
    const mockConvs = [{ id: "conv-1", title: "First chat", created_at: new Date().toISOString() }];
    mockGetChatConversations.mockResolvedValue(
      mockConvs as Awaited<ReturnType<typeof getChatConversations>>
    );

    const req = makeRequest("http://localhost:3000/api/agent/chat");

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.conversations).toHaveLength(1);
    expect(mockGetChatMessages).not.toHaveBeenCalled();
  });

  it("returns 500 when an asynchronous DB lookup rejects", async () => {
    mockGetChatConversations.mockRejectedValueOnce(new Error("DB error"));

    const req = makeRequest("http://localhost:3000/api/agent/chat");

    const res = await GET(req);

    expect(res.status).toBe(500);
  });
});
