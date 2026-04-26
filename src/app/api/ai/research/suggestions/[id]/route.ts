import { NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { dismissResearchSuggestion } from "@/lib/db";

/** DELETE /api/ai/research/suggestions/[id] — Dismiss a pending suggestion. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ok = dismissResearchSuggestion(id);
    if (!ok) {
      return NextResponse.json(
        { error: "Suggestion not found or not pending" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    apiLogger.error({ err: error }, "Dismiss suggestion error");
    return NextResponse.json(
      { error: "Failed to dismiss suggestion" },
      { status: 500 },
    );
  }
}
