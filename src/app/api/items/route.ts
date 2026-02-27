/**
 * API route: /api/items
 *
 * Handles listing and creating content items.
 *
 * GET  /api/items  — returns all items, optionally filtered and sorted.
 * POST /api/items  — creates a new item, enriched with Open Graph metadata.
 *
 * CORS headers are included on every response so the Chrome browser extension
 * (which runs on a different origin) can call this API directly.
 * The OPTIONS handler responds to CORS preflight requests.
 *
 * This file runs only on the server (Next.js API route). It may safely import
 * server-only modules like db.ts and og.ts.
 */

import { NextRequest, NextResponse } from "next/server";

import { getItems, insertItem } from "@/lib/db";
import { fetchOG } from "@/lib/og";
import type { ContentItem, ContentType, Priority, SourceType } from "@/lib/types";

// ── CORS ──────────────────────────────────────────────────────────────────────

/**
 * CORS headers added to every response from this route.
 *
 * "Access-Control-Allow-Origin: *" is intentionally permissive because this is
 * a local personal app. If you deploy to a public URL, restrict this to your
 * extension's chrome-extension:// origin.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Handles CORS preflight requests sent by the browser before POST.
 * Must be exported as `OPTIONS` for Next.js App Router to recognise it.
 */
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// ── GET /api/items ────────────────────────────────────────────────────────────

/**
 * Returns a list of content items, optionally filtered.
 *
 * Query parameters (all optional):
 *   source   — filter by sourceType (e.g. "gmail", "browser-extension")
 *   type     — filter by contentType (e.g. "article", "video")
 *   priority — filter by priority ("high", "medium", "low")
 *   unread   — "true" to return only unread items
 *   limit    — maximum number of items to return
 *   sort     — "recent" (default) | "priority"
 *
 * Response shape:
 *   { items: ContentItem[], total: number }
 */
export function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    // Extract and pass through query filters to the DB helper.
    const filters = {
      sourceType: searchParams.get("source") ?? undefined,
      contentType: searchParams.get("type") ?? undefined,
      priority: searchParams.get("priority") ?? undefined,
      // "unread=true" means we want items where isRead is false.
      isRead: searchParams.get("unread") === "true" ? false : undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
      sort: (searchParams.get("sort") as "recent" | "priority") ?? undefined,
    };

    const items = getItems(filters);

    return NextResponse.json({ items, total: items.length }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("[GET /api/items] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

// ── POST /api/items ───────────────────────────────────────────────────────────

/**
 * Creates a new content item.
 *
 * Required body fields:
 *   url        — the URL of the link to save
 *   sourceType — where it came from (e.g. "manual", "browser-extension")
 *
 * Optional body fields:
 *   title       — override the OG-fetched title
 *   contentType — "article" | "video" | "podcast" (default: "article")
 *   topics      — string[] of topic tags (default: [])
 *   notes       — plain text notes; used as the item's summary
 *   priority    — "high" | "medium" | "low" (default: "medium")
 *
 * The handler automatically fetches Open Graph metadata from the URL to enrich
 * the item with title, description, thumbnail, author, and publication name.
 * If OG fetching fails, the item is still created with whatever data was provided.
 *
 * Response: { item: ContentItem } with HTTP 201 on success.
 */
export async function POST(request: NextRequest) {
  try {
    // ── Parse request body ──────────────────────────────────────────────────

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // ── Validate required fields ────────────────────────────────────────────

    const url = body.url;
    if (!url || typeof url !== "string" || url.trim() === "") {
      return NextResponse.json(
        { error: "Missing required field: url" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const sourceType = body.sourceType;
    if (!sourceType || typeof sourceType !== "string") {
      return NextResponse.json(
        { error: "Missing required field: sourceType" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // ── Fetch Open Graph metadata ───────────────────────────────────────────
    // This enriches the item automatically — the user doesn't need to type a
    // title or description. If the fetch fails, og will contain all nulls and
    // we fall back to whatever the caller provided.

    const og = await fetchOG(url.trim());

    // ── Build the new item ──────────────────────────────────────────────────

    // Caller-provided title takes precedence over OG title.
    const title =
      (typeof body.title === "string" ? body.title.trim() : null) ?? og.title ?? url.trim(); // last resort: use the URL itself as title

    // Notes from the browser extension become the item's summary.
    // Fall back to the OG description.
    const summary =
      (typeof body.notes === "string" ? body.notes.trim() : null) ?? og.description ?? "";

    const newItem: ContentItem = {
      // Unique ID using the Web Crypto API (available in Node.js 18+ / Next.js).
      id: crypto.randomUUID(),
      title,
      summary,
      sourceType: sourceType as SourceType,
      contentType: (body.contentType as ContentType) ?? "article",
      topics: Array.isArray(body.topics) ? (body.topics as string[]) : [],
      author: og.author ?? undefined,
      publication: og.siteName ?? undefined,
      url: url.trim(),
      priority: (body.priority as Priority) ?? "medium",
      isRead: false,
      createdAt: new Date().toISOString(),
      // Optional fields from OG.
      thumbnailUrl: og.image ?? undefined,
    };

    // ── Persist and respond ─────────────────────────────────────────────────

    const inserted = insertItem(newItem);

    return NextResponse.json({ item: inserted }, { status: 201, headers: CORS_HEADERS });
  } catch (error) {
    console.error("[POST /api/items] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
