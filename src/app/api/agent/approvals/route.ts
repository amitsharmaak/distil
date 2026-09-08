/**
 * GET /api/agent/approvals — List pending approvals
 * POST /api/agent/approvals — Approve or reject a pending action
 */

import { NextRequest, NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

export async function GET(request: Request) {
  try {
    const { repositories } = await requireTenantRoute(request);
    const approvals = await repositories.agent.listPendingApprovals();
    return NextResponse.json({ approvals });
  } catch (error) {
    const authFailure = tenantRouteFailureResponse(error);
    if (authFailure.status !== 503) return authFailure;
    apiLogger.error({ err: error }, "Approvals GET error");
    return NextResponse.json({ error: "Failed to fetch approvals" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { repositories } = await requireTenantRoute(request);
    const body = await request.json();
    const { approvalId, decision } = body as {
      approvalId?: string;
      decision?: "approved" | "rejected";
    };

    if (!approvalId || !decision) {
      return NextResponse.json(
        { error: "approvalId and decision (approved/rejected) are required" },
        { status: 400 }
      );
    }

    if (decision !== "approved" && decision !== "rejected") {
      return NextResponse.json(
        { error: "decision must be 'approved' or 'rejected'" },
        { status: 400 }
      );
    }

    const pending = await repositories.agent.listPendingApprovals();
    if (!pending.some((approval) => approval.id === approvalId)) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }
    await repositories.agent.resolveApproval(approvalId, decision);

    // If approved, execute the tool
    // The approval payload contains the tool call details
    // We'd need to fetch the approval, parse the payload, and execute
    // For now, just mark as approved — the agent will pick it up

    return NextResponse.json({ success: true, approvalId, decision });
  } catch (error) {
    const authFailure = tenantRouteFailureResponse(error);
    if (authFailure.status !== 503) return authFailure;
    apiLogger.error({ err: error }, "Approvals POST error");
    return NextResponse.json({ error: "Failed to process approval" }, { status: 500 });
  }
}
