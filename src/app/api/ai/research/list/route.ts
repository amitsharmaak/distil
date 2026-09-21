import { NextResponse } from "next/server";
import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";
import { failStaleReport } from "@/lib/ai/research";

/** GET /api/ai/research/list — List recent research reports. */
export async function GET(req: Request) {
  try {
    const { repositories } = await requireTenantRoute(req);
    const reports = await Promise.all(
      (await repositories.research.listReports(50)).map((r) => failStaleReport(repositories, r))
    );
    return NextResponse.json({
      reports: reports.map((r) => ({
        ...r,
        sources: JSON.parse(r.sources),
        progress: r.progress ? JSON.parse(r.progress) : null,
      })),
    });
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}
