import { NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { runProactiveScan } from "@/lib/agent/proactive-research";
import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

/** POST /api/ai/research/proactive — Run an on-demand proactive topic scan. */
export async function POST(req: Request) {
  try {
    const { context, repositories } = await requireTenantRoute(req);
    const result = await runProactiveScan(context, repositories);
    return NextResponse.json(result);
  } catch (error) {
    const authFailure = tenantRouteFailureResponse(error);
    if (authFailure.status !== 503) return authFailure;
    apiLogger.error({ err: error }, "Proactive scan error");
    return NextResponse.json({ error: "Proactive scan failed" }, { status: 500 });
  }
}
