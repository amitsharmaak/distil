import { NextResponse } from "next/server";
import { getResearchReport } from "@/lib/db";

/** GET /api/ai/research/[id] — Get research report status and content. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const report = getResearchReport(id);

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  return NextResponse.json({
    report: {
      ...report,
      sources: JSON.parse(report.sources),
    },
  });
}
