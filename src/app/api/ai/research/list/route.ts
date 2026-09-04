import { NextResponse } from "next/server";
import { getResearchReports } from "@/lib/database";

/** GET /api/ai/research/list — List recent research reports. */
export async function GET() {
  const reports = await getResearchReports(50);
  return NextResponse.json({
    reports: reports.map((r) => ({
      ...r,
      sources: JSON.parse(r.sources),
      progress: r.progress ? JSON.parse(r.progress) : null,
    })),
  });
}
