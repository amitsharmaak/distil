/**
 * SQLite integration tests for GET /api/items and POST /api/items.
 *
 * We test the route handler functions directly (not via HTTP) to keep tests
 * fast and avoid needing a running Next.js server.
 *
 * The DB is in-memory so tests are isolated from the real data/distil.db file.
 */

// Use in-memory SQLite for all tests in this file.
process.env.DB_PATH = ":memory:";

jest.mock("@/lib/auth/tenant-route", () => {
  const actualDb = jest.requireActual<typeof import("@/lib/db")>("@/lib/db");
  return {
    requireTenantRoute: jest.fn(async () => ({
      context: {},
      repositories: {
        items: {
          list: actualDb.getItems,
          update: actualDb.updateItem,
          delete: actualDb.deleteItem,
        },
      },
    })),
    tenantRouteFailureResponse: jest.fn(() => new Response(null, { status: 500 })),
  };
});

jest.mock("@/lib/capture/composition", () => ({ composeCaptureRoutes: jest.fn() }));

// Keep route search deterministic even if developer API keys are present.
// The route contract only needs the repository-backed keyword result here;
// semantic-provider behavior is covered by its own unit tests.
jest.mock("@/lib/ai/search", () => {
  const actualDb = jest.requireActual<typeof import("@/lib/db")>("@/lib/db");
  return {
    hybridSearch: jest.fn(
      async (_repositories: unknown, query: string, filters: import("@/lib/db").ItemFilters = {}) =>
        actualDb.getItems({ ...filters, query })
    ),
  };
});

import { NextRequest } from "next/server";

// Import DB helpers to set up and tear down test data.
import { db, insertItem } from "@/lib/db";
import type { ContentItem } from "@/lib/types";

// Import the route handlers under test.
import { GET, POST, OPTIONS } from "../route";
import { composeCaptureRoutes } from "@/lib/capture/composition";

const createCapture = jest.fn();
const mockedComposeCaptureRoutes = jest.mocked(composeCaptureRoutes);

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

function makeRequest(
  url: string,
  options?: ConstructorParameters<typeof NextRequest>[1]
): NextRequest {
  return new NextRequest(url, options);
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  db.exec("DELETE FROM items");
  createCapture.mockReset();
  createCapture.mockResolvedValue({
    receipt: {
      id: "capture-1",
      normalizedUrl: "https://example.com/capture",
      status: "queued",
      retryable: true,
      attempts: 0,
      createdAt: "2026-09-08T00:00:00.000Z",
      updatedAt: "2026-09-08T00:00:00.000Z",
    },
    duplicate: false,
  });
  mockedComposeCaptureRoutes.mockResolvedValue({
    authenticate: async () => ({ kind: "session", context: {} }) as never,
    service: async () => ({ create: createCapture }) as never,
  });
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
    await insertItem(makeItem({ id: "a" }));
    await insertItem(makeItem({ id: "b" }));

    const req = makeRequest("http://localhost:3000/api/items");
    const res = await GET(req);
    const body = await res.json();

    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(2);
  });

  it("filters by source query param", async () => {
    await insertItem(makeItem({ id: "g", sourceType: "gmail" }));
    await insertItem(makeItem({ id: "s", sourceType: "slack" }));

    const req = makeRequest("http://localhost:3000/api/items?source=gmail");
    const res = await GET(req);
    const body = await res.json();

    expect(body.total).toBe(1);
    expect(body.items[0].sourceType).toBe("gmail");
  });

  it("filters by type query param", async () => {
    await insertItem(makeItem({ id: "v", contentType: "video" }));
    await insertItem(makeItem({ id: "a", contentType: "article" }));

    const req = makeRequest("http://localhost:3000/api/items?type=video");
    const res = await GET(req);
    const body = await res.json();

    expect(body.total).toBe(1);
    expect(body.items[0].contentType).toBe("video");
  });

  it("filters unread items when unread=true", async () => {
    await insertItem(makeItem({ id: "u", isRead: false }));
    await insertItem(makeItem({ id: "r", isRead: true }));

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
    await insertItem(makeItem({ id: "ready1", url: "https://example.com/ready1" }));
    await insertItem(
      makeItem({ id: "proc1", url: "https://example.com/proc1", processingStatus: "processing" })
    );

    const req = makeRequest("http://localhost:3000/api/items");
    const res = await GET(req);
    const body = await res.json();

    expect(body.total).toBe(1);
    expect(body.items[0].id).toBe("ready1");
  });

  it("includes processing items when includeProcessing=true", async () => {
    await insertItem(makeItem({ id: "ready2", url: "https://example.com/ready2" }));
    await insertItem(
      makeItem({ id: "proc2", url: "https://example.com/proc2", processingStatus: "processing" })
    );

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
    await insertItem(makeItem({ id: "s1", title: "TypeScript tutorial for beginners" }));
    await insertItem(makeItem({ id: "s2", title: "Cooking recipes for dinner" }));

    const req = makeRequest("http://localhost:3000/api/items?q=TypeScript");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.items[0].id).toBe("s1");
  });

  it("?q= (empty string) returns all items without FTS filtering", async () => {
    await insertItem(makeItem({ id: "e1", title: "First item" }));
    await insertItem(makeItem({ id: "e2", title: "Second item" }));

    const req = makeRequest("http://localhost:3000/api/items?q=");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(2);
  });

  it("?q=<nomatch> returns empty items array and total: 0", async () => {
    await insertItem(makeItem({ id: "n1", title: "Completely unrelated content" }));

    const req = makeRequest("http://localhost:3000/api/items?q=xyznonexistentterm");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("?q=<term>&source=<sourceType> applies both filters (intersection)", async () => {
    await insertItem(makeItem({ id: "i1", title: "JavaScript news", sourceType: "gmail" }));
    await insertItem(makeItem({ id: "i2", title: "JavaScript news", sourceType: "slack" }));
    await insertItem(makeItem({ id: "i3", title: "Python tutorial", sourceType: "gmail" }));

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

  it("maps omitted sourceType to a web capture", async () => {
    const req = makeRequest("http://localhost:3000/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/default-source" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(202);
    expect(createCapture).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/default-source", source: "web" })
    );
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

  it("returns a durable 202 receipt and forwards capture metadata", async () => {
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

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.receipt.status).toBe("queued");
    expect(createCapture).toHaveBeenCalledWith({
      url: "https://example.com/create-test",
      source: "web",
      topics: ["Tech"],
      priority: "high",
    });
  });

  it("returns 200 when the tenant capture service finds a duplicate", async () => {
    createCapture.mockResolvedValueOnce({
      receipt: {
        id: "capture-existing",
        normalizedUrl: "https://example.com/dup",
        status: "ready",
        itemId: "dup-1",
        retryable: false,
        attempts: 1,
        createdAt: "2026-09-08T00:00:00.000Z",
        updatedAt: "2026-09-08T00:00:01.000Z",
      },
      duplicate: true,
    });

    const req = makeRequest("http://localhost:3000/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/dup", sourceType: "manual" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicate).toBe(true);
    expect(body.receipt.itemId).toBe("dup-1");
  });

  it("forwards a caller-provided title", async () => {
    const req = makeRequest("http://localhost:3000/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/title-test",
        sourceType: "manual",
        title: "My Custom Title",
      }),
    });
    await POST(req);
    expect(createCapture).toHaveBeenCalledWith(
      expect.objectContaining({ title: "My Custom Title" })
    );
  });

  it("forwards notes and browser-extension source", async () => {
    const req = makeRequest("http://localhost:3000/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/notes-test",
        sourceType: "browser-extension",
        notes: "My personal notes about this page.",
      }),
    });
    await POST(req);
    expect(createCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: "My personal notes about this page.",
        source: "browser-extension",
      })
    );
  });

  it("applies the capture contract defaults", async () => {
    const req = makeRequest("http://localhost:3000/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/defaults-test", sourceType: "manual" }),
    });
    await POST(req);
    expect(createCapture).toHaveBeenCalledWith({
      url: "https://example.com/defaults-test",
      source: "web",
      priority: "medium",
      topics: [],
    });
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
