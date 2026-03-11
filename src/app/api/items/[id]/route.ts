/**
 * API route: /api/items/[id]
 *
 * Handles updating and deleting a single content item by ID.
 *
 * PATCH  /api/items/[id] — partially updates item fields (e.g. mark as read).
 * DELETE /api/items/[id] — removes the item permanently.
 *
 * Same CORS headers as /api/items so the browser extension can use these too.
 */

import { NextRequest, NextResponse } from "next/server";

import { apiLogger } from "@/lib/logger";
import { updateItem, deleteItem } from "@/lib/db";

// ── CORS ──────────────────────────────────────────────────────────────────────

/** Shared CORS headers — see /api/items/route.ts for rationale. */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// ── Route params type ─────────────────────────────────────────────────────────

/** Next.js App Router passes route params as a Promise in Next.js 15+. */
type RouteContext = { params: Promise<{ id: string }> };

// ── PATCH /api/items/[id] ─────────────────────────────────────────────────────

/**
 * Partially updates a content item.
 *
 * Only the fields present in the request body are updated; all other fields
 * retain their current values. This makes it safe to call with just the
 * field you want to change — e.g. `{ "isRead": true }`.
 *
 * Updatable fields:
 *   isRead      — boolean (mark as read/unread)
 *   priority    — "high" | "medium" | "low"
 *   topics      — string[] (replace the tag list)
 *   summary     — string (edit the summary)
 *   title       — string (edit the title)
 *
 * Response: { item: ContentItem } on success, { error } on 400/404/500.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // ── Parse request body ──────────────────────────────────────────────────
    let patch: Record<string, unknown>;
    try {
      patch = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!patch || typeof patch !== "object" || Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "Request body must contain at least one field to update" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // ── Apply the update ────────────────────────────────────────────────────
    // updateItem merges the patch onto the existing item, so only provided
    // fields change. Returns undefined if the item was not found.

    const updated = updateItem(id, patch);

    if (!updated) {
      return NextResponse.json(
        { error: `Item with id "${id}" not found` },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json({ item: updated }, { headers: CORS_HEADERS });
  } catch (error) {
    apiLogger.error({ err: error }, "PATCH /api/items/:id unexpected error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

// ── DELETE /api/items/[id] ────────────────────────────────────────────────────

/**
 * Permanently deletes a content item by ID.
 *
 * Response: { success: true } on success, { error } on 404/500.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // deleteItem returns false if no row matched the given ID.
    const deleted = deleteItem(id);

    if (!deleted) {
      return NextResponse.json(
        { error: `Item with id "${id}" not found` },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json({ success: true }, { headers: CORS_HEADERS });
  } catch (error) {
    apiLogger.error({ err: error }, "DELETE /api/items/:id unexpected error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
