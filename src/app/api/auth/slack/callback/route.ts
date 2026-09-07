import { requireDormantConnectorRoute } from "@/lib/connectors/route-gate";
import { tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

/**
 * GET /api/auth/slack/callback
 *
 * Handles the OAuth2 callback from Slack after the user grants (or denies) access.
 * Exchanges the authorization code for a user token, stores it, and redirects
 * back to the Sources page.
 *
 * Success: redirects to /sources?connected=slack
 * Failure: redirects to /sources?error=slack_denied | slack_failed
 */
export async function GET(request: Request) {
  try {
    return await requireDormantConnectorRoute(request);
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}
