import { NextRequest, NextResponse } from "next/server";
import { generateSummary } from "@/lib/ai/summarize";
import { getItemById } from "@/lib/db";

/** POST /api/ai/summarize — Generate an AI summary for a content item. */
export async function POST(req: NextRequest) {
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

    const item = getItemById(itemId);
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const result = await generateSummary(itemId, { length, force });

    return NextResponse.json({
      summary: result.summary,
      cached: result.cached,
      itemId,
    });
  } catch (error) {
    console.error("Summarize error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate summary" },
      { status: 500 },
    );
  }
}
