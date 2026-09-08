import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";
import {
  resolveLegacyAuthRequest,
  resolveNeonAuthRequest,
  type ProviderIdentityPort,
} from "@/lib/auth/request-context";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import { readNeonAuthFoundation } from "@/lib/auth/neon-auth-foundation";
import { readAuthEnvironment } from "@/lib/auth/environment";
import type { AuthContext } from "@/lib/contracts";

export async function resolveCurrentAccount(
  request: Request,
  dependencies?: { provider: ProviderIdentityPort; repositories: AuthRepositoryPort }
) {
  // Keep the optional Neon adapter out of legacy/SQLite route module graphs. The
  // provider is ESM-only and should be loaded only when Neon Auth is enabled.
  const provider =
    dependencies?.provider ?? (await import("@/lib/auth/neon-server")).getNeonAuthServer();
  const repositories = dependencies?.repositories ?? (await getAuthRepositoryPort());
  return resolveNeonAuthRequest(
    provider,
    repositories,
    request.headers.get("x-trace-id") ?? undefined
  );
}

/** Resolve the exact locked AuthContext for tenant-aware application code. */
export async function resolveRequestAuthContext(
  request: Request,
  dependencies?: { provider: ProviderIdentityPort; repositories: AuthRepositoryPort }
): Promise<AuthContext> {
  if (readNeonAuthFoundation().enabled) {
    return (await resolveCurrentAccount(request, dependencies)).context;
  }
  const environment = readAuthEnvironment();
  return resolveLegacyAuthRequest(request, {
    sessionSecret: environment.sessionSecret,
    legacyUserId: process.env.DISTIL_LEGACY_USER_ID ?? "",
    requestId: request.headers.get("x-trace-id") ?? undefined,
  });
}
