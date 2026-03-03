import { NextResponse } from "next/server";

import { syncNewsletters } from "@/lib/connectors/gmail";

/**
 * POST /api/gmail/sync
 *
 * Triggers a Gmail newsletter sync. Fetches emails with List-Unsubscribe
 * headers from the last 30 days, deduplicates, and inserts new items.
 *
 * Returns: { count: number, items: ContentItem[] }
 */
export async function POST() {
  try {
    const items = await syncNewsletters();
    return NextResponse.json({ count: items.length, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";

    if (message === "Gmail not connected") {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error("[POST /api/gmail/sync] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
