import { requireDormantConnectorRoute } from "@/lib/connectors/route-gate";
import { tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

// This route is local-only while hosted connectors are disabled. Keep its
// declaration within the Hobby deployment ceiling so the dormant route does
// not block Preview builds.
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  try {
    return await requireDormantConnectorRoute(request);
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}
