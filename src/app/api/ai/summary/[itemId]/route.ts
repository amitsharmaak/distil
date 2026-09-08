import { NextRequest, NextResponse } from "next/server";
import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

/** GET /api/ai/summary/[itemId] — Get cached AI summary for an item. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    const { repositories } = await requireTenantRoute(req);
    const { itemId } = await params;
    if (!(await repositories.items.findById(itemId)))
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    const type = req.nextUrl.searchParams.get("type") as "brief" | "detailed" | null;
    if (type)
      return NextResponse.json({
        summary: (await repositories.summaries.find(itemId, type)) ?? null,
      });
    return NextResponse.json({ summaries: await repositories.summaries.findAll(itemId) });
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}
