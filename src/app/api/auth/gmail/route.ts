import { requireDormantConnectorRoute } from "@/lib/connectors/route-gate";
import { tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

/**
 * GET /api/auth/gmail
 *
 * Initiates the Gmail OAuth2 flow by redirecting the user to Google's
 * consent screen. After the user grants access, Google redirects them
 * to /api/auth/gmail/callback.
 */
export async function GET(request: Request) {
  try {
    return await requireDormantConnectorRoute(request);
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}

/**
 * DELETE /api/auth/gmail
 *
 * Disconnects Gmail by revoking the OAuth token with Google and
 * removing it from the local database.
 */
export async function DELETE(request: Request) {
  try {
    return await requireDormantConnectorRoute(request);
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}
