/**
 * API route: POST /api/items/[id]/extract
 *
 * Fetches the item's URL, extracts article content (Readability) and OG metadata,
 * then updates the item. Designed to be called asynchronously from the client so
 * the feed detail page can render immediately.
 *
 * Extraction is attempted at most once per item — the `content_extracted_at`
 * timestamp is always written (even on failure) so subsequent visits skip the
 * network round-trip entirely.
 *
 * Response: { item, extracted: boolean } on success, { error } on 404/500.
 */

import { NextResponse } from "next/server";

import { getItemById, updateItem } from "@/lib/db";
import { fetchOG } from "@/lib/og";
import { extractContent } from "@/lib/content-extractor";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const item = getItemById(id);

    if (!item) {
      return NextResponse.json(
        { error: `Item with id "${id}" not found` },
        { status: 404 }
      );
    }

    // Already extracted (success or failure) — return what we have.
    if (item.contentExtractedAt) {
      return NextResponse.json({ item, extracted: false });
    }

    if (!item.url) {
      return NextResponse.json(
        { error: "Item has no URL to extract" },
        { status: 400 }
      );
    }

    const [extraction, og] = await Promise.all([
      extractContent(item.url),
      !item.thumbnailUrl ? fetchOG(item.url) : Promise.resolve(null),
    ]);

    const patch: Record<string, unknown> = {
      contentExtractedAt: new Date().toISOString(),
    };
    if (extraction?.content) patch.fullContent = extraction.content;
    if (extraction?.extractedLinks) patch.extractedLinks = extraction.extractedLinks;
    if (og?.image && !item.thumbnailUrl) patch.thumbnailUrl = og.image;
    if (og?.siteName && !item.publication) patch.publication = og.siteName;

    const updated = updateItem(id, patch);
    return NextResponse.json({ item: updated, extracted: true });
  } catch (err) {
    console.error("POST /api/items/[id]/extract error:", err);
    return NextResponse.json(
      { error: "Failed to extract content" },
      { status: 500 }
    );
  }
}
