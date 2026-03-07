/**
 * Tests for GET /api/items and POST /api/items.
 *
 * We test the route handler functions directly (not via HTTP) to keep tests
 * fast and avoid needing a running Next.js server.
 *
 * The DB is in-memory so tests are isolated from the real data/pia.db file.
 */

// Use in-memory SQLite for all tests in this file.
process.env.DB_PATH = ":memory:";

// Mock content-extractor (jsdom is ESM-only and breaks Jest CJS transform).
jest.mock("@/lib/content-extractor", () => ({
  extractContent: jest.fn().mockResolvedValue(null),
}));

// Mock AI summarizer so POST doesn't fire real Gemini calls.
jest.mock("@/lib/ai/summarize", () => ({
  generateSummary: jest.fn().mockResolvedValue({ summary: "mock", cached: false }),
}));

// Mock notifications so POST doesn't try to create real notifications.
jest.mock("@/lib/notifications", () => ({
  createNotificationIfEnabled: jest.fn(),
}));

import { NextRequest } from "next/server";

// Import DB helpers to set up and tear down test data.
import { db, insertItem } from "@/lib/db";
import type { ContentItem } from "@/lib/types";

// Import the route handlers under test.
import { GET, POST, OPTIONS } from "../route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: `item-${Date.now()}-${Math.random()}`,
    title: "Test Item",
    summary: "Summary",
    sourceType: "manual",
    contentType: "article",
    topics: ["Test"],
    url: "https://example.com",
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
});

// ── POST /api/items ───────────────────────────────────────────────────────────

describe("POST /api/items", () => {
  // Mock fetchOG so POST tests don't make real network calls.
  beforeEach(() => {
    jest.mock("@/lib/og", () => ({
      fetchOG: jest.fn().mockResolvedValue({
        title: "OG Title",
        description: "OG Description",
        image: "https://example.com/og.jpg",
        author: "OG Author",
        siteName: "OG Site",
      }),
    }));
  });

  afterEach(() => {
    jest.resetModules();
  });

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

  it("returns 400 when sourceType is missing", async () => {
    const req = makeRequest("http://localhost:3000/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/sourceType/i);
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
        url: "https://example.com",
        sourceType: "manual",
        topics: ["Tech"],
        priority: "high",
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.item).toBeDefined();
    expect(body.item.url).toBe("https://example.com");
    expect(body.item.sourceType).toBe("manual");
    expect(body.item.topics).toEqual(["Tech"]);
    expect(body.item.priority).toBe("high");
    expect(body.item.isRead).toBe(false);
    expect(body.item.id).toBeDefined();
  });

  it("uses caller-provided title over OG title", async () => {
    const req = makeRequest("http://localhost:3000/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com",
        sourceType: "manual",
        title: "My Custom Title",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(body.item.title).toBe("My Custom Title");
  });

  it("uses notes as summary", async () => {
    const req = makeRequest("http://localhost:3000/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com",
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
      body: JSON.stringify({ url: "https://example.com", sourceType: "manual" }),
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
      body: JSON.stringify({ url: "https://example.com", sourceType: "manual" }),
    });
    const res = await POST(req);

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
