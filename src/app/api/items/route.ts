/**
 * API route: /api/items
 *
 * Handles listing and creating content items.
 *
 * GET  /api/items  — returns all items, optionally filtered and sorted.
 * POST /api/items  — creates a new item via the Unified Intelligence pipeline.
 *
 * CORS headers are included on every response so the Chrome browser extension
 * (which runs on a different origin) can call this API directly.
 * The OPTIONS handler responds to CORS preflight requests.
 *
 * This file runs only on the server (Next.js API route). It may safely import
 * server-only modules like db.ts and og.ts.
 */

import { NextRequest, NextResponse } from "next/server";

import { apiLogger } from "@/lib/logger";
import { getItems, getItemById, getItemByNormalizedUrl } from "@/lib/db";
import { hybridSearch } from "@/lib/ai/search";
import { buildRawContent, processContent } from "@/lib/intelligence/pipeline";
import { sanitizeUrl, normalizeUrl } from "@/lib/utils";
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
 *   includeProcessing — "true" to include items still processing (default: only ready)
 *
 * Response shape:
 *   { items: ContentItem[], total: number }
 */
export async function GET(request: NextRequest) {
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
      query: searchParams.get("q") ?? undefined,
      includeProcessing: searchParams.get("includeProcessing") === "true",
    };

    let items: ContentItem[];
    if (filters.query) {
      const { query, ...otherFilters } = filters;
      items = await hybridSearch(query!, otherFilters);
    } else {
      items = getItems(filters);
    }

    return NextResponse.json({ items, total: items.length }, { headers: CORS_HEADERS });
  } catch (error) {
    apiLogger.error({ err: error }, "GET /api/items unexpected error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

// ── POST /api/items ───────────────────────────────────────────────────────────

/**
 * Creates a new content item via the Unified Intelligence pipeline.
 *
 * Required body fields:
 *   url — the URL of the link to save
 *
 * Optional body fields:
 *   sourceType  — where it came from (default: "manual")
 *   title       — override the page title
 *   contentType — "article" | "video" | "podcast" (default: "article")
 *   topics      — string[] of topic tags (default: [])
 *   notes       — plain text notes; used as userNotes in metadata
 *   priority    — "high" | "medium" | "low" (default: "medium")
 *
 * The handler fetches the page HTML, builds RawContent, and runs it through
 * processContent(). If the pipeline rejects (e.g. relevance gate), returns 422.
 *
 * Response: { item: ContentItem } with HTTP 201 for new, 200 for duplicate.
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

    const trimmedUrl = sanitizeUrl(url);
    const normalizedUrl = normalizeUrl(trimmedUrl);
    const sourceType = (body.sourceType as SourceType) ?? "manual";

    // ── Fetch page HTML ──────────────────────────────────────────────────────

    let rawBody: string;
    try {
      const response = await fetch(trimmedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Distil/1.0)" },
        signal: AbortSignal.timeout(10000),
      });
      rawBody = await response.text();
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
      apiLogger.warn({ err: fetchError, url: trimmedUrl }, "POST /api/items fetch failed");
      return NextResponse.json(
        { error: `Failed to fetch URL: ${message}` },
        { status: 422, headers: CORS_HEADERS }
      );
    }

    // ── Build RawContent and run pipeline ────────────────────────────────────

    const raw = buildRawContent({
      sourceType,
      rawBody,
      url: normalizedUrl,
      metadata: {
        pageTitle: typeof body.title === "string" ? body.title.trim() : undefined,
        userNotes: typeof body.notes === "string" ? body.notes.trim() : undefined,
        priority: (body.priority as Priority) ?? undefined,
        contentType: (body.contentType as ContentType) ?? undefined,
        topics: Array.isArray(body.topics) ? (body.topics as string[]) : undefined,
      },
    });

    const result = await processContent(raw);

    if (result.status === "rejected") {
      return NextResponse.json(
        { error: result.rejectionReason ?? "Content was rejected" },
        { status: 422, headers: CORS_HEADERS }
      );
    }

    // ── Load full item and respond ───────────────────────────────────────────

    const item =
      getItemById(raw.id) ?? getItemByNormalizedUrl(normalizedUrl);
    if (!item) {
      apiLogger.error({ rawId: raw.id, url: normalizedUrl }, "POST /api/items item not found after pipeline");
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const isNew = item.id === raw.id;
    return NextResponse.json(
      { item },
      { status: isNew ? 201 : 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    apiLogger.error({ err: error }, "POST /api/items unexpected error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
