/**
 * Tests for GET /api/items and POST /api/items.
 *
 * We test the route handler functions directly (not via HTTP) to keep tests
 * fast and avoid needing a running Next.js server.
 *
 * The DB is in-memory so tests are isolated from the real data/distil.db file.
 */

// Use in-memory SQLite for all tests in this file.
process.env.DB_PATH = ":memory:";

// Mock fetch so POST doesn't make real network calls.
const mockFetch = jest.fn().mockResolvedValue({
  text: () => Promise.resolve("<html><head><title>Test</title></head><body>content</body></html>"),
});
global.fetch = mockFetch as typeof fetch;

// Mock the intelligence pipeline so POST doesn't run full classifier/extractor/enricher.
jest.mock("@/lib/intelligence/pipeline", () => {
  const actualDb = jest.requireActual<typeof import("@/lib/db")>("@/lib/db");
  return {
    buildRawContent: jest.fn((params: { sourceType: string; rawBody: string; url?: string; metadata?: Record<string, unknown> }) => ({
      id: "mock-raw-id",
      sourceType: params.sourceType,
      rawBody: params.rawBody,
      url: params.url,
      metadata: params.metadata ?? {},
      fetchedAt: new Date().toISOString(),
    })),
    processContent: jest.fn().mockImplementation(async (raw: { id: string; sourceType: string; url?: string; metadata?: { pageTitle?: string; userNotes?: string; priority?: string; contentType?: string; topics?: string[] } }) => {
      const existing = actualDb.getItemByNormalizedUrl(raw.url ?? "");
      if (existing) return { status: "ready" as const };

      const meta = raw.metadata ?? {};
      const item = {
        id: raw.id,
        title: meta.pageTitle ?? raw.url ?? "Untitled",
        summary: meta.userNotes ?? "Enriched summary",
        sourceType: raw.sourceType as import("@/lib/types").SourceType,
        contentType: (meta.contentType as "article" | "video" | "podcast") ?? "article",
        topics: meta.topics ?? [],
        url: raw.url ?? "",
        priority: (meta.priority as "high" | "medium" | "low") ?? "medium",
        isRead: false,
        createdAt: new Date().toISOString(),
      };
      actualDb.insertItem(item);
      return { status: "ready" as const };
    }),
  };
});

import { NextRequest } from "next/server";

// Import DB helpers to set up and tear down test data.
import { db, insertItem } from "@/lib/db";
import type { ContentItem } from "@/lib/types";

// Import the route handlers under test.
import { GET, POST, OPTIONS } from "../route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  // Generate a unique url so URL-based deduplication never collapses two
  // distinct test items into one when they share the same normalized URL.
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id: `item-${uid}`,
    title: "Test Item",
    summary: "Summary",
    sourceType: "manual",
    contentType: "article",
    topics: ["Test"],
    url: `https://example.com/${uid}`,
    priority: "medium",
    isRead: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRequest(url: string, options?: RequestInit): NextRequest {
  return new NextRequest(url, options);
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  db.exec("DELETE FROM items");
});

// ── OPTIONS ───────────────────────────────────────────────────────────────────

describe("OPTIONS /api/items", () => {
  it("returns 204 with CORS headers", async () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});

// ── GET /api/items ────────────────────────────────────────────────────────────

describe("GET /api/items", () => {
  it("returns empty list when no items exist", async () => {
    const req = makeRequest("http://localhost:3000/api/items");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("returns all items", async () => {
    insertItem(makeItem({ id: "a" }));
    insertItem(makeItem({ id: "b" }));

    const req = makeRequest("http://localhost:3000/api/items");
    const res = await GET(req);
    const body = await res.json();

    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(2);
  });

  it("filters by source query param", async () => {
    insertItem(makeItem({ id: "g", sourceType: "gmail" }));
    insertItem(makeItem({ id: "s", sourceType: "slack" }));

    const req = makeRequest("http://localhost:3000/api/items?source=gmail");
    const res = await GET(req);
    const body = await res.json();

    expect(body.total).toBe(1);
    expect(body.items[0].sourceType).toBe("gmail");
  });

  it("filters by type query param", async () => {
    insertItem(makeItem({ id: "v", contentType: "video" }));
    insertItem(makeItem({ id: "a", contentType: "article" }));

    const req = makeRequest("http://localhost:3000/api/items?type=video");
    const res = await GET(req);
    const body = await res.json();

    expect(body.total).toBe(1);
    expect(body.items[0].contentType).toBe("video");
  });

  it("filters unread items when unread=true", async () => {
    insertItem(makeItem({ id: "u", isRead: false }));
    insertItem(makeItem({ id: "r", isRead: true }));

    const req = makeRequest("http://localhost:3000/api/items?unread=true");
    const res = await GET(req);
    const body = await res.json();

    expect(body.total).toBe(1);
    expect(body.items[0].isRead).toBe(false);
  });

  it("includes CORS headers in response", async () => {
    const req = makeRequest("http://localhost:3000/api/items");
    const res = await GET(req);

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("excludes processing items by default (includeProcessing absent)", async () => {
    insertItem(makeItem({ id: "ready1", url: "https://example.com/ready1" }));
    insertItem(makeItem({ id: "proc1", url: "https://example.com/proc1", processingStatus: "processing" }));

    const req = makeRequest("http://localhost:3000/api/items");
    const res = await GET(req);
    const body = await res.json();

    expect(body.total).toBe(1);
    expect(body.items[0].id).toBe("ready1");
  });

  it("includes processing items when includeProcessing=true", async () => {
    insertItem(makeItem({ id: "ready2", url: "https://example.com/ready2" }));
    insertItem(makeItem({ id: "proc2", url: "https://example.com/proc2", processingStatus: "processing" }));

    const req = makeRequest("http://localhost:3000/api/items?includeProcessing=true");
    const res = await GET(req);
    const body = await res.json();

    expect(body.total).toBe(2);
    const ids = body.items.map((i: ContentItem) => i.id);
    expect(ids).toContain("ready2");
    expect(ids).toContain("proc2");
  });
});

// ── GET /api/items — search ───────────────────────────────────────────────────

describe("GET /api/items — search", () => {
  it("?q=<term> returns only items whose title matches", async () => {
    insertItem(makeItem({ id: "s1", title: "TypeScript tutorial for beginners" }));
    insertItem(makeItem({ id: "s2", title: "Cooking recipes for dinner" }));

    const req = makeRequest("http://localhost:3000/api/items?q=TypeScript");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.items[0].id).toBe("s1");
  });

  it("?q= (empty string) returns all items without FTS filtering", async () => {
    insertItem(makeItem({ id: "e1", title: "First item" }));
    insertItem(makeItem({ id: "e2", title: "Second item" }));

    const req = makeRequest("http://localhost:3000/api/items?q=");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(2);
  });

  it("?q=<nomatch> returns empty items array and total: 0", async () => {
    insertItem(makeItem({ id: "n1", title: "Completely unrelated content" }));

    const req = makeRequest("http://localhost:3000/api/items?q=xyznonexistentterm");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("?q=<term>&source=<sourceType> applies both filters (intersection)", async () => {
    insertItem(makeItem({ id: "i1", title: "JavaScript news", sourceType: "gmail" }));
    insertItem(makeItem({ id: "i2", title: "JavaScript news", sourceType: "slack" }));
    insertItem(makeItem({ id: "i3", title: "Python tutorial", sourceType: "gmail" }));

    const req = makeRequest("http://localhost:3000/api/items?q=JavaScript&source=gmail");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.items[0].id).toBe("i1");
    expect(body.items[0].sourceType).toBe("gmail");
  });
});

// ── POST /api/items ───────────────────────────────────────────────────────────

describe("POST /api/items", () => {
  it("returns 400 when url is missing", async () => {
    const req = makeRequest("http://localhost:3000/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceType: "manual" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/url/i);
  });

  it("defaults sourceType to manual when omitted", async () => {
    const req = makeRequest("http://localhost:3000/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/default-source" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.item.sourceType).toBe("manual");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = makeRequest("http://localhost:3000/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("creates an item and returns 201 with the created item", async () => {
    const req = makeRequest("http://localhost:3000/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/create-test",
        sourceType: "manual",
        topics: ["Tech"],
        priority: "high",
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.item).toBeDefined();
    expect(body.item.url).toContain("example.com");
    expect(body.item.sourceType).toBe("manual");
    expect(body.item.priority).toBe("high");
    expect(body.item.isRead).toBe(false);
    expect(body.item.id).toBeDefined();
  });

  it("uses caller-provided title in metadata", async () => {
    const req = makeRequest("http://localhost:3000/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/title-test",
        sourceType: "manual",
        title: "My Custom Title",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(body.item.title).toBe("My Custom Title");
  });

  it("uses notes as summary when provided", async () => {
    const req = makeRequest("http://localhost:3000/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/notes-test",
        sourceType: "browser-extension",
        notes: "My personal notes about this page.",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(body.item.summary).toBe("My personal notes about this page.");
  });

  it("defaults contentType to article and priority to medium", async () => {
    const req = makeRequest("http://localhost:3000/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/defaults-test", sourceType: "manual" }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(body.item.contentType).toBe("article");
    expect(body.item.priority).toBe("medium");
  });

  it("includes CORS headers in response", async () => {
    const req = makeRequest("http://localhost:3000/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/cors-test", sourceType: "manual" }),
    });
    const res = await POST(req);

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
