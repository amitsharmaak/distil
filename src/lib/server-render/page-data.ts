import { headers } from "next/headers";

import { AccessDeniedError } from "@/lib/auth/account";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import type { AuthContext } from "@/lib/contracts/tenant-context";
import { withTenantRepositories } from "@/lib/database";
import { apiLogger } from "@/lib/logger";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";
import type { RepositorySet } from "@/lib/repositories/ports";

/**
 * Server-rendered pages load their first page of data directly: one auth
 * resolution from the proxy's identity handoff and one tenant transaction.
 *
 * `null` means "render the client island and let it fetch": PostgreSQL is not
 * configured (legacy SQLite compatibility), `FEATURE_SERVER_RENDER=false`
 * (the one-release escape hatch), or the request carries no resolvable user.
 * The last case only happens where the proxy has let an anonymous request
 * through (test mode); the island's API calls still enforce authentication,
 * so falling back never reveals data.
 */
export async function loadPageData<T>(
  route: string,
  operation: (repositories: RepositorySet, context: AuthContext) => Promise<T>
): Promise<T | null> {
  // Read the request first, before any environment check: a page whose only
  // request-bound call sits behind an env guard is prerendered at build time
  // (where DATABASE_URL is unset) with the fallback baked in, and every
  // visitor then gets the client-fetch page. `headers()` opts the route into
  // per-request rendering unconditionally.
  const requestHeaders = await headers();
  if (!readPhase2FeatureFlags().serverRender || !process.env.DATABASE_URL) return null;
  let context: AuthContext;
  try {
    context = await resolveRequestAuthContext(
      new Request(`http://distil.local${route}`, { headers: requestHeaders })
    );
  } catch (error) {
    if (error instanceof AccessDeniedError) return null;
    throw error;
  }
  try {
    return await withTenantRepositories(context, (repositories) =>
      operation(repositories, context)
    );
  } catch (error) {
    // A data failure degrades to the island, which surfaces the API's own
    // error card instead of a route-level crash.
    apiLogger.error({ err: error, route }, "server render data load failed");
    return null;
  }
}
