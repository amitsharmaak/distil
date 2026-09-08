import { NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

/** DELETE /api/ai/research/suggestions/[id] — Dismiss a pending suggestion. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { repositories } = await requireTenantRoute(req);
    const { id } = await params;
    const ok = await repositories.research.dismissSuggestion(id);
    if (!ok) {
      return NextResponse.json({ error: "Suggestion not found or not pending" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authFailure = tenantRouteFailureResponse(error);
    if (authFailure.status !== 503) return authFailure;
    apiLogger.error({ err: error }, "Dismiss suggestion error");
    return NextResponse.json({ error: "Failed to dismiss suggestion" }, { status: 500 });
  }
}
