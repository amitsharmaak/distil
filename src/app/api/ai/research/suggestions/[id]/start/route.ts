import { NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import {
  getResearchReport,
  getResearchSuggestionById,
  markResearchSuggestionStarted,
} from "@/lib/database";
import { startResearch } from "@/lib/ai/research";

/** POST /api/ai/research/suggestions/[id]/start — Approve and start deep research. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const row = await getResearchSuggestionById(id);
    if (!row || row.status !== "pending") {
      return NextResponse.json({ error: "Suggestion not found or not pending" }, { status: 404 });
    }

    let sourceItemIds: string[] = [];
    try {
      sourceItemIds = JSON.parse(row.source_item_ids || "[]") as string[];
    } catch {
      sourceItemIds = [];
    }
    const itemId = sourceItemIds[0];

    const reportId = await startResearch(row.suggested_query, itemId);
    await markResearchSuggestionStarted(id, reportId);

    const report = await getResearchReport(reportId);
    return NextResponse.json({ report }, { status: 202 });
  } catch (error) {
    apiLogger.error({ err: error }, "Start suggestion research error");
    return NextResponse.json({ error: "Failed to start research" }, { status: 500 });
  }
}
