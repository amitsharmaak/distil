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

import { apiLogger } from "@/lib/logger";
import { getItems, insertItem, getItemByNormalizedUrl } from "@/lib/db";
import { hybridSearch } from "@/lib/ai/search";
import { fetchOG } from "@/lib/og";
import type { OGData } from "@/lib/og";
import { extractContent } from "@/lib/content-extractor";
import { generateSummary } from "@/lib/ai/summarize";
import { autoTagItem } from "@/lib/ai/tagger";
import { embedItem } from "@/lib/ai/embeddings";
import { createNotificationIfEnabled } from "@/lib/notifications";
import { detectStrategy } from "@/lib/content-strategies";
import { sanitizeUrl } from "@/lib/utils";
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

    const trimmedUrl = sanitizeUrl(url);

    // ── Detect content strategy ──────────────────────────────────────────────
    const strategy = detectStrategy(trimmedUrl);

    // ── Dedup check ──────────────────────────────────────────────────────────
    const existingItem = getItemByNormalizedUrl(trimmedUrl);
    if (existingItem) {
      return NextResponse.json(
        { item: existingItem, duplicate: true },
        { status: 200, headers: CORS_HEADERS },
      );
    }

    // ── Fetch OG metadata, extract full content, and enrich metadata in parallel ─
    // All three fetch the URL independently with their own timeouts. If any
    // fails, it returns nulls/{} — the item is still created with whatever
    // data is available.

    const [og, extraction, enriched] = await Promise.all([
      fetchOG(trimmedUrl),
      strategy.extractContent ? extractContent(trimmedUrl) : Promise.resolve(null),
      strategy.enrichMetadata(trimmedUrl, { title: null, description: null, image: null, author: null, siteName: null } satisfies OGData),
    ]);

    // ── Build the new item ──────────────────────────────────────────────────

    const title =
      (typeof body.title === "string" ? body.title.trim() : null) ?? og.title ?? url.trim();

    const summary =
      (typeof body.notes === "string" ? body.notes.trim() : null) ?? og.description ?? "";

    // Resolve contentType: use strategy-detected type unless it's "article",
    // in which case fall back to the caller-supplied value or default to "article".
    const contentType: ContentType =
      strategy.contentType !== "article"
        ? strategy.contentType
        : ((body.contentType as ContentType) ?? "article");

    const newItem: ContentItem = {
      id: crypto.randomUUID(),
      title,
      summary,
      sourceType: sourceType as SourceType,
      contentType,
      topics: Array.isArray(body.topics) ? (body.topics as string[]) : [],
      // OG author takes priority; fall back to extracted byline, then enriched metadata.
      author: og.author ?? extraction?.byline ?? enriched.author ?? undefined,
      // OG site name takes priority; fall back to enriched metadata.
      publication: og.siteName ?? enriched.publication ?? undefined,
      url: trimmedUrl,
      priority: (body.priority as Priority) ?? "medium",
      isRead: false,
      createdAt: new Date().toISOString(),
      // Enriched thumbnail takes priority (higher quality for YouTube oEmbed);
      // for non-enriched strategies enriched.thumbnailUrl is undefined, so ogData.image wins.
      thumbnailUrl: enriched.thumbnailUrl ?? og.image ?? undefined,
      // Full content and extracted links from Readability (only when extractContent is true).
      fullContent: extraction?.content ?? undefined,
      extractedLinks: extraction?.extractedLinks ?? undefined,
    };

    // ── Persist and respond ─────────────────────────────────────────────────

    const inserted = insertItem(newItem);

    // Create in-app notification for high-priority items (if preference enabled).
    createNotificationIfEnabled(inserted);

    // Fire-and-forget: generate AI summary in the background.
    // Strategy controls whether summarization is appropriate for this content type.
    if (strategy.generateAISummary) {
      generateSummary(inserted.id, { length: "brief" }).catch((err) => {
        apiLogger.error({ err, itemId: inserted.id }, "POST /api/items background summary failed");
      });
    }

    // Fire-and-forget: auto-tag items that have no topics.
    if (inserted.topics.length === 0) {
      autoTagItem(inserted.id, inserted.title, inserted.summary).catch((err) => {
        apiLogger.error({ err, itemId: inserted.id }, "POST /api/items background auto-tag failed");
      });
    }

    // Fire-and-forget: embed item for semantic deduplication.
    embedItem(inserted.id, inserted.title, inserted.summary).catch((err) => {
      apiLogger.error({ err, itemId: inserted.id }, "POST /api/items background embedding failed");
    });

    return NextResponse.json({ item: inserted }, { status: 201, headers: CORS_HEADERS });
  } catch (error) {
    apiLogger.error({ err: error }, "POST /api/items unexpected error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
