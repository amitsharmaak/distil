import { NextResponse } from "next/server";
import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";
import { withRequestMetrics } from "@/lib/observability/request-metrics";

/** GET /api/ai/research/suggestions — Pending topic suggestions from proactive scan. */
export const GET = withRequestMetrics(async (req: Request): Promise<Response> => {
  try {
    const { repositories } = await requireTenantRoute(req);
    const suggestions = await repositories.research.listPendingSuggestions();
    return NextResponse.json({
      suggestions: suggestions.map((s) => ({
        id: s.id,
        topic: s.topic,
        reason: s.reason,
        suggestedQuery: s.suggestedQuery,
        sourceItemIds: s.sourceItemIds,
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
});
