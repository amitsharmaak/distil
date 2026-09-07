import { requireDormantConnectorRoute } from "@/lib/connectors/route-gate";
import { tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

/**
 * GET /api/auth/slack
 *
 * Initiates the Slack User OAuth flow by redirecting to Slack's consent screen.
 * After the user grants access, Slack redirects back to /api/auth/slack/callback.
 */
export async function GET(request: Request) {
  try {
    return await requireDormantConnectorRoute(request);
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}

/**
 * DELETE /api/auth/slack
 *
 * Disconnects a Slack workspace. Expects JSON body { teamId: string }.
 */
export async function DELETE(request: Request) {
  try {
    return await requireDormantConnectorRoute(request);
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}
