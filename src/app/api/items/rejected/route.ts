/**
 * API route: /api/items/rejected
 *
 * Returns items with processing_status = 'rejected'.
 * Used by the Settings page to let users review false rejections.
 *
 * GET /api/items/rejected
 *
 * Query parameters (optional):
 *   limit  — max items to return (default: 50)
 *   offset — pagination offset (default: 0)
 *
 * Response: { items: ContentItem[], total: number }
 */

import { NextRequest, NextResponse } from "next/server";

import { getRejectedItems } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 50;
    const offset = searchParams.get("offset") ? Number(searchParams.get("offset")) : 0;

    const { items, total } = getRejectedItems(limit, offset);

    return NextResponse.json({ items, total });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
