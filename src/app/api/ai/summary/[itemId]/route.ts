import { NextRequest, NextResponse } from "next/server";
import { getAISummary, getAISummaries } from "@/lib/database";

/** GET /api/ai/summary/[itemId] — Get cached AI summary for an item. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const type = req.nextUrl.searchParams.get("type") as "brief" | "detailed" | null;

  if (type) {
    const summary = await getAISummary(itemId, type);
    return NextResponse.json({ summary: summary ?? null });
  }

  const summaries = await getAISummaries(itemId);
  return NextResponse.json({ summaries });
}
