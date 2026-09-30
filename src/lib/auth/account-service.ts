import { cache } from "react";
import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";
import {
  resolveLegacyAuthRequest,
  resolveNeonAuthRequest,
  type ProviderIdentityPort,
} from "@/lib/auth/request-context";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import { readNeonAuthFoundation } from "@/lib/auth/neon-auth-foundation";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { IDENTITY_HEADER, verifyIdentityToken } from "@/lib/auth/identity-token";
import { createAuthContext, type AuthContext } from "@/lib/contracts";
import { countProviderCalls } from "@/lib/auth/auth-metrics";
import { apiLogger } from "@/lib/logger";
import { measurePhase } from "@/lib/observability/request-metrics";
import {
  P10_PREVIEW_NIL_USER_ID,
  P10_PREVIEW_PROBE_HEADER,
  P10_PREVIEW_PROBE_VALUE,
} from "@/lib/auth/p10-preview-probe";

/** Server-Timing phase covering provider verification and the account lookup. */
const AUTH_PHASE = "auth";
const TRACE_HEADER = "x-trace-id";

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
    countProviderCalls(provider),
    repositories,
    request.headers.get(TRACE_HEADER) ?? undefined
  );
}

/**
 * Resolve the exact locked AuthContext for tenant-aware application code.
 *
 * A valid proxy identity token bound to this request's trace id yields the
 * context with zero I/O. Without one (queue routes, capture tokens, direct
 * invocation) the identity is resolved in full as before; an invalid token is
 * treated as absent and logged, never trusted. React `cache()` lets a layout
 * and a page share one resolution for the same request object.
 */
export const resolveRequestAuthContext = cache(
  (
    request: Request,
    dependencies?: { provider: ProviderIdentityPort; repositories: AuthRepositoryPort }
  ): Promise<AuthContext> =>
    measurePhase(AUTH_PHASE, () => resolveRequestAuthContextUnmeasured(request, dependencies))
);

async function resolveRequestAuthContextUnmeasured(
  request: Request,
  dependencies?: { provider: ProviderIdentityPort; repositories: AuthRepositoryPort }
): Promise<AuthContext> {
  const environment = readAuthEnvironment();
  const handedOff = await resolveHandedOffIdentity(request, environment.identityTokenSecret);
  if (handedOff) return handedOff;

  if (readNeonAuthFoundation().enabled) {
    return (await resolveCurrentAccount(request, dependencies)).context;
  }
  const configuredLegacyUserId = process.env.DISTIL_LEGACY_USER_ID;
  // TEMPORARY P10 Preview probe: the proxy can add this header only after it
  // has stripped inbound internal headers and verified the legacy session.
  const legacyUserId =
    configuredLegacyUserId === undefined &&
    request.headers.get(P10_PREVIEW_PROBE_HEADER) === P10_PREVIEW_PROBE_VALUE
      ? P10_PREVIEW_NIL_USER_ID
      : (configuredLegacyUserId ?? "");
  return resolveLegacyAuthRequest(request, {
    sessionSecret: environment.sessionSecret,
    legacyUserId,
    requestId: request.headers.get(TRACE_HEADER) ?? undefined,
  });
}

async function resolveHandedOffIdentity(
  request: Request,
  secret: string
): Promise<AuthContext | undefined> {
  const token = request.headers.get(IDENTITY_HEADER);
  if (!token) return undefined;
  const traceId = request.headers.get(TRACE_HEADER);
  let rejection: string;
  try {
    const verified = await verifyIdentityToken(token, { secret, traceId });
    if (verified.ok) {
      if (verified.claims.kind === "user" && traceId) {
        return createAuthContext({
          userId: verified.claims.sub,
          actorKind: "user",
          actorId: verified.claims.sub,
          requestId: traceId,
          ...(verified.claims.sid ? { sessionId: verified.claims.sid } : {}),
        });
      }
      rejection = "claims";
    } else {
      rejection = verified.reason;
    }
  } catch {
    // An unusable secret or an unparseable context: fall back, never trust.
    rejection = "unverifiable";
  }
  apiLogger.warn(
    { event: "auth_handoff_rejected", code: rejection, traceId: traceId ?? undefined },
    "Proxy identity handoff rejected; resolving the identity in full"
  );
  return undefined;
}
