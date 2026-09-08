/**
 * GET /api/agent/status — Returns current agent activity.
 * Shows running workflows, recent actions, pending approvals.
 */

import { NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

export async function GET(request: Request) {
  try {
    const { repositories } = await requireTenantRoute(request);
    const [
      runningWorkflows,
      recentWorkflows,
      recentActions,
      pendingApprovals,
      auditStats,
      jobStats,
    ] = await Promise.all([
      repositories.agent.listWorkflows({ status: "running", limit: 10 }),
      repositories.agent.listWorkflows({ limit: 10 }),
      repositories.agent.listActions({ limit: 20 }),
      repositories.agent.listPendingApprovals(10),
      repositories.agent.getDailyAuditStats(),
      repositories.jobs.getStats(),
    ]);

    return NextResponse.json({
      runningWorkflows,
      recentWorkflows,
      recentActions,
      pendingApprovals,
      stats: {
        ...auditStats,
        jobs: jobStats,
      },
    });
  } catch (error) {
    const authFailure = tenantRouteFailureResponse(error);
    if (authFailure.status !== 503) return authFailure;
    apiLogger.error({ err: error }, "Agent status endpoint error");
    return NextResponse.json({ error: "Failed to fetch agent status" }, { status: 500 });
  }
}
