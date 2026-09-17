import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";
import { apiLogger } from "@/lib/logger";
import { withRequestMetrics } from "@/lib/observability/request-metrics";

const MAX_IDS = 50;
const MAX_ID_LENGTH = 160;

function parseIds(request: Request): string[] | undefined {
  const raw = new URL(request.url).searchParams.get("ids");
  if (!raw) return undefined;
  const values = raw.split(",");
  if (
    values.length > MAX_IDS ||
    values.some((value) => value.trim().length === 0 || value.trim().length > MAX_ID_LENGTH)
  ) {
    return undefined;
  }
  return [...new Set(values.map((value) => value.trim()))];
}

export const GET = withRequestMetrics(async (request: Request): Promise<Response> => {
  try {
    const ids = parseIds(request);
    if (!ids) {
      return Response.json(
        { error: { code: "INVALID_REQUEST", message: "ids must contain 1 to 50 item ids" } },
        { status: 400 }
      );
    }
    const { repositories } = await requireTenantRoute(request);
    const items = await repositories.items.listProcessingStatuses(ids);
    return Response.json({ items });
  } catch (error) {
    const failure = tenantRouteFailureResponse(error);
    if (failure.status !== 503) return failure;
    apiLogger.error({ err: error }, "GET /api/v1/items/status failed");
    return Response.json(
      { error: { code: "PROCESSING_FAILED", message: "Unable to load item statuses" } },
      { status: 500 }
    );
  }
});
