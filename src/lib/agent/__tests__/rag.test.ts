/**
 * Tests for the RAG (Retrieval-Augmented Generation) pipeline.
 *
 * Covers intent classification, retrieval routing, fallback behaviour,
 * citation building, and error handling — all with mocked I/O so the
 * tests remain fast and fully isolated.
 */

// In-memory DB so schema init doesn't touch the real file.
process.env.DB_PATH = ":memory:";

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("@/lib/ai/search", () => ({
  hybridSearch: jest.fn(),
}));

jest.mock("@/lib/ai/router", () => ({
  generateText: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  getItems: jest.fn(),
}));

jest.mock("@/lib/pii-filter", () => ({
  filterPII: jest.fn((text: string) => ({ filtered: text, piiFound: false })),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { ragQuery } from "../rag";
import { hybridSearch } from "@/lib/ai/search";
import { generateText } from "@/lib/ai/router";
import { getItems } from "@/lib/db";
import type { ContentItem } from "@/lib/types";

const mockHybridSearch = hybridSearch as jest.MockedFunction<typeof hybridSearch>;
const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;
const mockGetItems = getItems as jest.MockedFunction<typeof getItems>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  const uid = Math.random().toString(36).slice(2);
  return {
    id: `item-${uid}`,
    title: "Test Article",
    summary: "A summary of the test article with enough content to chunk.",
    sourceType: "manual",
    contentType: "article",
    topics: ["Technology"],
    url: `https://example.com/${uid}`,
    priority: "medium",
    isRead: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGenerateText.mockResolvedValue("Here is a helpful answer based on your content.");
  mockHybridSearch.mockResolvedValue([]);
  mockGetItems.mockReturnValue([]);
});

// ── Intent classification — conversational ────────────────────────────────────

describe("ragQuery — conversational intent", () => {
  const greetings = ["hi", "hello", "hey", "thanks", "thank you", "ok", "bye"];

  it.each(greetings)('responds directly to "%s" without retrieval', async (greeting) => {
    const result = await ragQuery(greeting);

    expect(result.chunksUsed).toBe(0);
    expect(result.citations).toEqual([]);
    expect(mockHybridSearch).not.toHaveBeenCalled();
    expect(mockGetItems).not.toHaveBeenCalled();
  });

  it("returns a fallback when generateText fails for a greeting", async () => {
    mockGenerateText.mockRejectedValue(new Error("API timeout"));

    const result = await ragQuery("hello");

    expect(result.answer).toBeDefined();
    expect(result.chunksUsed).toBe(0);
  });
});

// ── Intent classification — general ──────────────────────────────────────────

describe("ragQuery — general intent", () => {
  const generalQueries = [
    "what's new",
    "what should I read",
    "summarize my feed",
    "catch me up",
    "show me the latest",
    "what do I have",
    "recommend something",
    "brief me",
    "give me a digest",
    // Queries that were previously misrouted as "specific"
    "what articles do you have",
    "what items do you have",
    "what content is saved",
    "list my articles",
    "list all items",
    "do you have any articles",
    "any items saved",
  ];

  it.each(generalQueries)('routes "%s" to general retrieval (getItems)', async (query) => {
    const item = makeItem({ isRead: false });
    mockGetItems.mockReturnValue([item]);

    await ragQuery(query);

    expect(mockGetItems).toHaveBeenCalled();
    expect(mockHybridSearch).not.toHaveBeenCalled();
  });

  it("prefers unread items for general queries", async () => {
    const unread = makeItem({ id: "unread-1", isRead: false });
    mockGetItems.mockImplementation((filters) => {
      if (filters && filters.isRead === false) return [unread];
      return [];
    });

    const result = await ragQuery("what's new?");

    expect(mockGetItems).toHaveBeenCalledWith(expect.objectContaining({ isRead: false }));
    expect(result.chunksUsed).toBeGreaterThan(0);
  });

  it("falls back to all items when no unread items exist", async () => {
    const read = makeItem({ id: "read-1", isRead: true });
    mockGetItems.mockImplementation((filters) => {
      if (filters && filters.isRead === false) return [];
      return [read];
    });

    const result = await ragQuery("what's in my feed");

    // First call: isRead: false (returns empty), second call: limit only (returns read item)
    expect(mockGetItems).toHaveBeenCalledTimes(2);
    expect(result.chunksUsed).toBeGreaterThan(0);
  });
});

// ── Intent classification — specific ─────────────────────────────────────────

describe("ragQuery — specific intent", () => {
  it("routes specific topic queries to hybridSearch", async () => {
    const item = makeItem({ title: "React Hooks Deep Dive" });
    mockHybridSearch.mockResolvedValue([item]);

    await ragQuery("tell me about React hooks");

    expect(mockHybridSearch).toHaveBeenCalledWith(
      expect.stringContaining("React hooks"),
      { limit: 20 },
    );
    expect(mockGetItems).not.toHaveBeenCalled();
  });

  it("falls back to general retrieval when specific search returns nothing", async () => {
    mockHybridSearch.mockResolvedValue([]);
    const item = makeItem({ title: "Fallback Article" });
    // getItems is called by the general fallback
    mockGetItems.mockReturnValue([item]);

    const result = await ragQuery("obscure topic xyz123abc");

    expect(mockHybridSearch).toHaveBeenCalled();
    expect(mockGetItems).toHaveBeenCalled();
    expect(result.chunksUsed).toBeGreaterThan(0);
  });
});

// ── Empty library ─────────────────────────────────────────────────────────────

describe("ragQuery — empty library", () => {
  it("returns empty-library message when no items exist anywhere", async () => {
    mockHybridSearch.mockResolvedValue([]);
    mockGetItems.mockReturnValue([]);

    const result = await ragQuery("what should I read today");

    expect(result.answer.toLowerCase()).toContain("empty");
    expect(result.chunksUsed).toBe(0);
    expect(result.citations).toEqual([]);
  });

  it("does NOT return empty-library message for specific queries when items exist", async () => {
    mockHybridSearch.mockResolvedValue([]); // specific search finds nothing
    const item = makeItem({ title: "General Fallback Article" });
    mockGetItems.mockReturnValue([item]); // but items exist

    const result = await ragQuery("some obscure specific query");

    expect(result.answer.toLowerCase()).not.toContain("empty");
    expect(result.chunksUsed).toBeGreaterThan(0);
  });
});

// ── Citation building ─────────────────────────────────────────────────────────

describe("ragQuery — citations", () => {
  it("returns citations for retrieved items", async () => {
    const item = makeItem({
      id: "article-1",
      title: "TypeScript Best Practices",
      url: "https://example.com/ts",
      sourceType: "manual",
    });
    mockHybridSearch.mockResolvedValue([item]);

    const result = await ragQuery("TypeScript tips");

    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({
      id: "article-1",
      title: "TypeScript Best Practices",
      url: "https://example.com/ts",
      sourceType: "manual",
    });
  });

  it("deduplicates citations when the same item produces multiple chunks", async () => {
    // Long content that will split into multiple chunks
    const longSummary = Array(20).fill("Paragraph of content about React.").join("\n\n");
    const item = makeItem({ id: "dup-1", title: "Long Article", summary: longSummary });
    mockHybridSearch.mockResolvedValue([item]);

    const result = await ragQuery("React");

    // Only one citation entry despite multiple chunks
    const citationIds = result.citations.map((c) => c.id);
    expect(new Set(citationIds).size).toBe(citationIds.length);
  });
});

// ── Generation errors ─────────────────────────────────────────────────────────

describe("ragQuery — generation errors", () => {
  it("returns error message when generateText throws", async () => {
    const item = makeItem();
    mockHybridSearch.mockResolvedValue([item]);
    mockGenerateText.mockRejectedValue(new Error("Gemini API error"));

    const result = await ragQuery("tell me about this article");

    expect(result.answer.toLowerCase()).toContain("error");
    // Citations and chunksUsed are still populated (retrieved before generation failed)
    expect(result.chunksUsed).toBeGreaterThan(0);
  });
});
