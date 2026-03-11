import { NextRequest, NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { startResearch } from "@/lib/ai/research";
import { getResearchReport } from "@/lib/db";

/** POST /api/ai/research — Start a deep research task. */
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
