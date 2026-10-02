import { NextResponse } from "next/server";
import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";
import { failStaleReport } from "@/lib/ai/research";
import { withRequestMetrics } from "@/lib/observability/request-metrics";

/** GET /api/ai/research/list — List recent research reports. */
export const GET = withRequestMetrics(async (req: Request): Promise<Response> => {
  try {
    const { repositories } = await requireTenantRoute(req);
    const reports = await Promise.all(
      (await repositories.research.listReportSummaries(50)).map((report) =>
        failStaleReport(repositories, report)
      )
    );
    return NextResponse.json({
      reports: reports.map((report) => ({
        id: report.id,
        itemId: report.itemId,
        query: report.query,
        status: report.status,
        createdAt: report.createdAt,
        completedAt: report.completedAt,
      })),
    });
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
});
