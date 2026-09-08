import { NextResponse } from "next/server";
import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

/** GET /api/ai/feedback/[itemId] — Get most recent feedback for an item. */
export async function GET(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    const { repositories } = await requireTenantRoute(req);
    const { itemId } = await params;
    if (!(await repositories.items.findById(itemId)))
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    const feedback = await repositories.feedback.findForItem(itemId);
    return NextResponse.json({ feedback: feedback ?? null });
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}
