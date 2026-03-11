/**
 * GET /api/agent/status — Returns current agent activity.
 * Shows running workflows, recent actions, pending approvals.
 */

import { NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import {
  getWorkflowRuns,
  getAgentActions,
  getPendingApprovals,
  getDailyAuditStats,
  getJobStats,
} from "@/lib/db";
import { getDailyUsage } from "@/lib/ai/router";

export async function GET() {
  try {
    const [
      runningWorkflows,
      recentWorkflows,
      recentActions,
      pendingApprovals,
      auditStats,
      jobStats,
    ] = [
      getWorkflowRuns({ status: "running", limit: 10 }),
      getWorkflowRuns({ limit: 10 }),
      getAgentActions({ limit: 20 }),
      getPendingApprovals(10),
      getDailyAuditStats(),
      getJobStats(),
    ];

    return NextResponse.json({
      runningWorkflows,
      recentWorkflows,
      recentActions,
      pendingApprovals,
      stats: {
        dailyCost: getDailyUsage(),
        ...auditStats,
        jobs: jobStats,
      },
    });
  } catch (error) {
    apiLogger.error({ err: error }, "Agent status endpoint error");
    return NextResponse.json(
      { error: "Failed to fetch agent status" },
      { status: 500 },
    );
  }
}
