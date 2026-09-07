import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { authFailureResponse } from "@/lib/auth/http";
import { getTenantRepositories } from "@/lib/database";

/**
 * Single request boundary for application routes that access tenant data.
 * The context is derived only from the authenticated request; route callers
 * never provide a user id or a repository selected by a user-controlled id.
 */
export async function requireTenantRoute(request: Request) {
  const context = await resolveRequestAuthContext(request);
  return { context, repositories: await getTenantRepositories(context) };
}

/** Keep auth failures indistinguishable from the other protected surfaces. */
export function tenantRouteFailureResponse(error: unknown): Response {
  return authFailureResponse(error);
}
