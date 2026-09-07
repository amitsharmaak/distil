import { requireDormantConnectorRoute } from "@/lib/connectors/route-gate";
import { tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

/**
 * GET /api/auth/slack/status
 *
 * Returns status for all connected Slack workspaces.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    return await requireDormantConnectorRoute(request);
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}
