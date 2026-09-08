import { NextRequest, NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { reprioritize } from "@/lib/ai/prioritize";
import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

/** POST /api/ai/prioritize — Re-prioritize all items using preferences. */
export async function POST(req: NextRequest) {
  try {
    const { context, repositories } = await requireTenantRoute(req);
    const body = await req.json().catch(() => ({}));
    const { useAI } = body as { useAI?: boolean };

    const results = await reprioritize(context, repositories, useAI ?? false);

    return NextResponse.json({
      updated: results.length,
      items: results,
    });
  } catch (error) {
    const authFailure = tenantRouteFailureResponse(error);
    if (authFailure.status !== 503) return authFailure;
    apiLogger.error({ err: error }, "Prioritize error");
    return NextResponse.json({ error: "Failed to re-prioritize items" }, { status: 500 });
  }
}
