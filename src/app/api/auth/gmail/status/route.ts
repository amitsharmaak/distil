import { requireDormantConnectorRoute } from "@/lib/connectors/route-gate";
import { tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

export interface GmailStatusResponse {
  connected: boolean;
  email: string | null;
  lastSync: string | null;
}

/**
 * GET /api/auth/gmail/status
 *
 * Returns the current Gmail connection status. Used by the Sources page
 * to decide whether to show the "Connect" or "Sync Now" button.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    return await requireDormantConnectorRoute(request);
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}
