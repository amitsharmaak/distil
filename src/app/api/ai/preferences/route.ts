import { NextRequest, NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { getPreferences, getAgentConfig, saveAgentConfig } from "@/lib/ai/preferences";
import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

/** GET /api/ai/preferences — Get current user preferences and agent config. */
export async function GET(req: Request) {
  try {
    const { repositories } = await requireTenantRoute(req);
    const [preferences, configRaw] = await Promise.all([
      getPreferences(repositories),
      getAgentConfig(repositories),
    ]);
    return NextResponse.json({ preferences, config: configRaw ? JSON.parse(configRaw) : null });
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}

/** PUT /api/ai/preferences — Update agent config (from Settings page). */
export async function PUT(req: NextRequest) {
  try {
    const { repositories } = await requireTenantRoute(req);
    const body = await req.json();
    await saveAgentConfig(repositories, JSON.stringify(body));
    return NextResponse.json({ config: body });
  } catch (error) {
    const authFailure = tenantRouteFailureResponse(error);
    if (authFailure.status !== 503) return authFailure;
    apiLogger.error({ err: error }, "Preferences update error");
    return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 });
  }
}
