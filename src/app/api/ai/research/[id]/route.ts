import { NextResponse } from "next/server";
import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";
import { failStaleReport, publicResearchProgressString } from "@/lib/ai/research";
import { withRequestMetrics } from "@/lib/observability/request-metrics";

/** GET /api/ai/research/[id] — Get research report status and content. */
export const GET = withRequestMetrics(
  async (req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> => {
    let report;
    try {
      const { repositories } = await requireTenantRoute(req);
      const { id } = await params;
      report = await repositories.research.findReport(id);
      if (report) report = await failStaleReport(repositories, report);
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
        progress: publicResearchProgressString(report.progress),
      },
    });
  }
);
