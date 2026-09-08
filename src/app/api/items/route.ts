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
import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";
import { composeCaptureRoutes } from "@/lib/capture/composition";
import { createCaptureCollectionHandlers } from "@/lib/capture/http";
import { createCaptureSchema } from "@/lib/capture/schema";
import { hybridSearch } from "@/lib/ai/search";
import type { ContentItem } from "@/lib/types";

/**
 * Fetches the URL and runs the full intelligence pipeline.
 * Used by POST /api/items as fire-and-forget background work so the
 * HTTP response can return immediately (202) before enrichment finishes.
 */

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
    const { repositories } = await requireTenantRoute(request);
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
      items = await hybridSearch(repositories, query!, otherFilters);
    } else {
      items = await repositories.items.list(filters);
    }

    return NextResponse.json({ items, total: items.length }, { headers: CORS_HEADERS });
  } catch (error) {
    const authFailure = tenantRouteFailureResponse(error);
    if (authFailure.status !== 503) return authFailure;
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

    // Capture is always dispatched through the authenticated durable state machine.
    {
      const composition = await composeCaptureRoutes();
      const captureBody = {
        url,
        title: typeof body.title === "string" ? body.title : undefined,
        notes: typeof body.notes === "string" ? body.notes : undefined,
        topics: Array.isArray(body.topics) ? body.topics : undefined,
        priority: body.priority,
        source: body.sourceType === "browser-extension" ? "browser-extension" : "web",
      };
      const capture = createCaptureSchema.safeParse(captureBody);
      if (!capture.success) {
        return NextResponse.json(
          { error: { code: "INVALID_REQUEST", message: "The capture request is invalid" } },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const durableRequest = new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(capture.data),
      });
      return createCaptureCollectionHandlers(composition).POST(durableRequest);
    }
  } catch (error) {
    apiLogger.error({ err: error }, "POST /api/items unexpected error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
