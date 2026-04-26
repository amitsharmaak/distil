import { NextResponse } from "next/server";
import { getPendingResearchSuggestions } from "@/lib/db";

/** GET /api/ai/research/suggestions — Pending topic suggestions from proactive scan. */
export async function GET() {
  const suggestions = getPendingResearchSuggestions();
  return NextResponse.json({
    suggestions: suggestions.map((s) => ({
      id: s.id,
      topic: s.topic,
      reason: s.reason,
      suggestedQuery: s.suggested_query,
      sourceItemIds: JSON.parse(s.source_item_ids || "[]") as string[],
      createdAt: s.created_at,
    })),
  });
}
