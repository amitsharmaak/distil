import { NextResponse } from "next/server";

import { apiLogger } from "@/lib/logger";
import { syncNewsletters } from "@/lib/connectors/gmail";

/**
 * POST /api/gmail/sync
 *
 * Triggers a Gmail email sync. Fetches emails from the configured date range,
 * processes them through the Unified Intelligence Layer pipeline.
 *
 * Returns: { count: number, items: ProcessingResult[] }
 */
export async function POST() {
  try {
    const { count, items } = await syncNewsletters();
    return NextResponse.json({ count, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";

    if (message === "Gmail not connected") {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    apiLogger.error({ err }, "POST /api/gmail/sync unexpected error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
