import { requireDormantConnectorRoute } from "@/lib/connectors/route-gate";
import { tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

/**
 * GET /api/auth/gmail/callback
 *
 * Handles the OAuth2 callback from Google after the user grants (or denies)
 * access. Exchanges the authorization code for tokens, stores them, and
 * redirects back to the Sources page.
 *
 * Success: redirects to /sources?connected=gmail
 * Failure: redirects to /sources?error=gmail_denied | gmail_failed
 */
export async function GET(request: Request) {
  try {
    return await requireDormantConnectorRoute(request);
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}
