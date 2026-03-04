import { NextResponse } from "next/server";
import { getAISummary } from "@/lib/db";

/** GET /api/ai/summary/[itemId] — Get cached AI summary for an item. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;
  const summary = getAISummary(itemId);

  return NextResponse.json({ summary: summary ?? null });
}
