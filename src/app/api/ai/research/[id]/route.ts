import { NextResponse } from "next/server";
import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

/** GET /api/ai/research/[id] — Get research report status and content. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let report;
  try {
    const { repositories } = await requireTenantRoute(req);
    const { id } = await params;
    report = await repositories.research.findReport(id);
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }

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
