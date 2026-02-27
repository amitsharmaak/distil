/**
 * Tests for PATCH /api/items/[id] and DELETE /api/items/[id].
 *
 * Uses in-memory SQLite and calls route handlers directly.
 */

// Use in-memory SQLite for all tests in this file.
process.env.DB_PATH = ":memory:";

import { NextRequest } from "next/server";
import { db, insertItem } from "@/lib/db";
import type { ContentItem } from "@/lib/types";
import { PATCH, DELETE, OPTIONS } from "../route";

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

/**
 * Creates a NextRequest for a route that has a dynamic [id] segment.
 * In tests we pass the params manually via the context argument.
 */
function makeRequest(
  id: string,
  options?: RequestInit
): [NextRequest, { params: Promise<{ id: string }> }] {
  const url = `http://localhost:3000/api/items/${id}`;
  return [new NextRequest(url, options), { params: Promise.resolve({ id }) }];
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  db.exec("DELETE FROM items");
});

// ── OPTIONS ───────────────────────────────────────────────────────────────────

describe("OPTIONS /api/items/[id]", () => {
  it("returns 204 with CORS headers", async () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

// ── PATCH /api/items/[id] ─────────────────────────────────────────────────────

describe("PATCH /api/items/[id]", () => {
  it("marks an item as read", async () => {
    const item = insertItem(makeItem({ id: "patch-read", isRead: false }));

    const [req, ctx] = makeRequest(item.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRead: true }),
    });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item.isRead).toBe(true);
    // Other fields unchanged.
    expect(body.item.title).toBe(item.title);
  });

  it("updates priority", async () => {
    const item = insertItem(makeItem({ id: "patch-prio", priority: "low" }));

    const [req, ctx] = makeRequest(item.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority: "high" }),
    });
    const res = await PATCH(req, ctx);

    const body = await res.json();
    expect(body.item.priority).toBe("high");
  });

  it("updates topics array", async () => {
    const item = insertItem(makeItem({ id: "patch-topics", topics: ["Old"] }));

    const [req, ctx] = makeRequest(item.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topics: ["New", "Tags"] }),
    });
    const res = await PATCH(req, ctx);

    const body = await res.json();
    expect(body.item.topics).toEqual(["New", "Tags"]);
  });

  it("returns 404 for a non-existent item", async () => {
    const [req, ctx] = makeRequest("nonexistent-id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRead: true }),
    });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 for empty body", async () => {
    const item = insertItem(makeItem({ id: "patch-empty" }));

    const [req, ctx] = makeRequest(item.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const [req, ctx] = makeRequest("any-id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(400);
  });

  it("includes CORS headers", async () => {
    const item = insertItem(makeItem({ id: "patch-cors" }));
    const [req, ctx] = makeRequest(item.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRead: true }),
    });
    const res = await PATCH(req, ctx);

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

// ── DELETE /api/items/[id] ────────────────────────────────────────────────────

describe("DELETE /api/items/[id]", () => {
  it("deletes an existing item and returns success", async () => {
    const item = insertItem(makeItem({ id: "del-exists" }));

    const [req, ctx] = makeRequest(item.id, { method: "DELETE" });
    const res = await DELETE(req, ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 404 for a non-existent item", async () => {
    const [req, ctx] = makeRequest("ghost-id", { method: "DELETE" });
    const res = await DELETE(req, ctx);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("includes CORS headers", async () => {
    const item = insertItem(makeItem({ id: "del-cors" }));
    const [req, ctx] = makeRequest(item.id, { method: "DELETE" });
    const res = await DELETE(req, ctx);

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
