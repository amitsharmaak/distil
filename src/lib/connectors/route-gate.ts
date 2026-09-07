import { requireTenantRoute } from "@/lib/auth/tenant-route";

/**
 * Connector workers are intentionally off until their per-user worker/runtime
 * contract lands. Authenticate and bind the tenant before returning the same
 * 404 for every dormant connector surface; this prevents their former global
 * SQLite paths from becoming an accidental multi-user API.
 */
export async function requireDormantConnectorRoute(request: Request): Promise<Response> {
  await requireTenantRoute(request);
  return Response.json(
    { error: { code: "NOT_FOUND", message: "Not found" } },
    { status: 404, headers: { "cache-control": "no-store" } }
  );
}
