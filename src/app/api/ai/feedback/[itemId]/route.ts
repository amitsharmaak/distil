import { NextResponse } from "next/server";
import { getFeedback } from "@/lib/db";

/** GET /api/ai/feedback/[itemId] — Get most recent feedback for an item. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;
  const feedback = getFeedback(itemId);

  return NextResponse.json({ feedback: feedback ?? null });
}
