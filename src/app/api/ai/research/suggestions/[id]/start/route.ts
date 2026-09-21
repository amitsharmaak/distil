import { NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";
import { startResearch } from "@/lib/ai/research";
import { withRequestMetrics } from "@/lib/observability/request-metrics";

/** Research continues after the 202 via `after()`, so allow the Hobby ceiling. */
export const maxDuration = 60;

/** POST /api/ai/research/suggestions/[id]/start — Approve and start deep research. */
export const POST = withRequestMetrics(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { context, repositories } = await requireTenantRoute(req);
      const { id } = await params;
      const row = await repositories.research.findSuggestion(id);
      if (!row || row.status !== "pending") {
        return NextResponse.json({ error: "Suggestion not found or not pending" }, { status: 404 });
      }

      let sourceItemIds: string[] = [];
      try {
        sourceItemIds = row.sourceItemIds;
      } catch {
        sourceItemIds = [];
      }
      const itemId = sourceItemIds[0];

      if (itemId && !(await repositories.items.findById(itemId)))
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      const reportId = await startResearch(context, repositories, row.suggestedQuery, itemId);
      await repositories.research.markSuggestionStarted(id, reportId);

      const report = await repositories.research.findReport(reportId);
      return NextResponse.json({ report }, { status: 202 });
    } catch (error) {
      const authFailure = tenantRouteFailureResponse(error);
      if (authFailure.status !== 503) return authFailure;
      apiLogger.error({ err: error }, "Start suggestion research error");
      return NextResponse.json({ error: "Failed to start research" }, { status: 500 });
    }
  }
);
