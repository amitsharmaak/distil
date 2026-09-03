/**
 * GET /api/agent/approvals — List pending approvals
 * POST /api/agent/approvals — Approve or reject a pending action
 */

import { NextRequest, NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { getPendingApprovals, resolveApproval } from "@/lib/db";

export async function GET() {
  try {
    const approvals = getPendingApprovals();
    return NextResponse.json({ approvals });
  } catch (error) {
    apiLogger.error({ err: error }, "Approvals GET error");
    return NextResponse.json(
      { error: "Failed to fetch approvals" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { approvalId, decision } = body as {
      approvalId?: string;
      decision?: "approved" | "rejected";
    };

    if (!approvalId || !decision) {
      return NextResponse.json(
        { error: "approvalId and decision (approved/rejected) are required" },
        { status: 400 },
      );
    }

    if (decision !== "approved" && decision !== "rejected") {
      return NextResponse.json(
        { error: "decision must be 'approved' or 'rejected'" },
        { status: 400 },
      );
    }

    resolveApproval(approvalId, decision);

    // If approved, execute the tool
    // The approval payload contains the tool call details
    // We'd need to fetch the approval, parse the payload, and execute
    // For now, just mark as approved — the agent will pick it up

    return NextResponse.json({ success: true, approvalId, decision });
  } catch (error) {
    apiLogger.error({ err: error }, "Approvals POST error");
    return NextResponse.json(
      { error: "Failed to process approval" },
      { status: 500 },
    );
  }
}
