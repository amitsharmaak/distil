import { requireDormantConnectorRoute } from "@/lib/connectors/route-gate";
import { tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

/**
 * POST /api/gmail/sync
 *
 * Triggers a Gmail email sync. Fetches emails from the configured date range,
 * processes them through the Unified Intelligence Layer pipeline.
 *
 * Returns: { count: number, items: ProcessingResult[] }
 */
export async function POST(request: Request) {
  try {
    return await requireDormantConnectorRoute(request);
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}
