/**
 * API route: /api/ai/research
 *
 * POST /api/ai/research — Starts an async deep-research task.
 *
 * Research runs in the background using Gemini with Google Search grounding.
 * The response returns immediately with the report record (status: "pending").
 * Poll GET /api/ai/research/[id] or stream GET /api/ai/research/[id]/stream
 * to wait for the result.
 *
 * Request body:
 *   query   (string, required) — the research question or topic
 *   itemId  (string, optional) — associate the report with a saved content item
 *
 * Response: 202 Accepted
 *   { report: ResearchReport }
 *   report.status starts as "pending", transitions to "complete" or "failed"
 */

import { NextRequest, NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { startResearch } from "@/lib/ai/research";
import { getResearchReport } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, itemId } = body as { query?: string; itemId?: string };

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const reportId = startResearch(query.trim(), itemId);
    const report = getResearchReport(reportId);

    return NextResponse.json({ report }, { status: 202 });
  } catch (error) {
    apiLogger.error({ err: error }, "Research error");
    return NextResponse.json(
      { error: "Failed to start research" },
      { status: 500 },
    );
  }
}
