import { NextRequest, NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { generateSummary } from "@/lib/ai/summarize";
import { getItemById } from "@/lib/database";
import { isTwitterUrl } from "@/lib/utils";
import { getTraceId } from "@/lib/middleware/trace";

/** POST /api/ai/summarize — Generate an AI summary for a content item. */
export async function POST(req: NextRequest) {
  let itemIdForLog: string | undefined;
  try {
    const body = await req.json();
    const { itemId, length, force } = body as {
      itemId?: string;
      length?: "brief" | "detailed";
      force?: boolean;
    };

    if (!itemId) {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    }

    const item = await getItemById(itemId);
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    itemIdForLog = item.id;

    if (isTwitterUrl(item.url)) {
      return NextResponse.json(
        { error: "AI summaries are not available for Twitter/X posts" },
        { status: 400 }
      );
    }

    const result = await generateSummary(itemId, { length, force });

    return NextResponse.json({
      summary: result.summary,
      cached: result.cached,
      itemId,
    });
  } catch {
    apiLogger.error(
      {
        event: "summary_generation_failed",
        traceId: getTraceId(),
        itemId: itemIdForLog,
      },
      "summary_generation_failed"
    );
    return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
  }
}
