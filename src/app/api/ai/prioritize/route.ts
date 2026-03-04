import { NextRequest, NextResponse } from "next/server";
import { reprioritize } from "@/lib/ai/prioritize";

/** POST /api/ai/prioritize — Re-prioritize all items using preferences. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { useAI } = body as { useAI?: boolean };

    const results = await reprioritize(useAI ?? false);

    return NextResponse.json({
      updated: results.length,
      items: results,
    });
  } catch (error) {
    console.error("Prioritize error:", error);
    return NextResponse.json(
      { error: "Failed to re-prioritize items" },
      { status: 500 },
    );
  }
}
