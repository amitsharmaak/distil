import type { AuthPrincipal } from "@/lib/contracts/capture";
import { AccessDeniedError } from "@/lib/auth/account";
import type { CaptureTokenIdentityResolver } from "@/lib/auth/capture-token-identity";
import {
  actorIdSchema,
  createAuthContext,
  requestIdSchema,
  type AuthContext,
} from "@/lib/contracts/tenant-context";
import {
  CAPTURE_RATE_LIMIT,
  CAPTURE_RATE_LIMIT_WINDOW_SECONDS,
  CAPTURE_TOKEN_PREFIX,
} from "@/lib/auth/constants";
import { hashCaptureToken, safeTokenEqual } from "@/lib/auth/capture-tokens";
import { AuthError } from "@/lib/auth/errors";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import type { RepositorySet } from "@/lib/repositories/ports";

export interface CapturePrincipalDependencies {
  tokenIdentities: CaptureTokenIdentityResolver;
  getTenantRepositories(context: AuthContext): Promise<RepositorySet>;
  resolveSessionContext(request: Request): Promise<AuthContext>;
}

export async function authenticateCaptureToken(
  request: Request,
  dependencies: Pick<CapturePrincipalDependencies, "tokenIdentities" | "getTenantRepositories">,
  now = new Date()
): Promise<AuthPrincipal> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  const token = match?.[1];
  if (!token?.startsWith(CAPTURE_TOKEN_PREFIX)) {
    throw new AuthError("UNAUTHORIZED", 401, "A valid capture token is required");
  }

  const tokenHash = hashCaptureToken(token);
  const identity = await dependencies.tokenIdentities.resolveActiveByHash(tokenHash);
  const actorId = actorIdSchema.safeParse(identity?.tokenId);
  if (!identity || !actorId.success) {
    throw new AuthError("UNAUTHORIZED", 401, "A valid capture token is required");
  }
  const parsedRequestId = requestIdSchema.safeParse(request.headers.get("x-trace-id"));
  const context = createAuthContext({
    userId: identity.userId,
    actorKind: "capture-token",
    actorId: actorId.data,
    requestId: parsedRequestId.success
      ? parsedRequestId.data
      : requestIdSchema.parse(crypto.randomUUID()),
  });
  const repositories = await dependencies.getTenantRepositories(context);
  const record = await repositories.captureTokens.findActiveByHash(tokenHash);
  if (!record || record.id !== identity.tokenId || record.userId !== identity.userId) {
    throw new AuthError("UNAUTHORIZED", 401, "A valid capture token is required");
  }

  await enforceRateLimit(repositories.rateLimits, {
    context,
    key: `capture-token:${record.id}`,
    operation: "capture-create",
    limit: CAPTURE_RATE_LIMIT,
    windowSeconds: CAPTURE_RATE_LIMIT_WINDOW_SECONDS,
    now,
  });
  await repositories.captureTokens.touchLastUsed(record.id, now.toISOString());
  return {
    kind: "capture-token",
    context,
    userId: context.userId,
    tokenId: record.id,
  };
}

/** Resolve capture API authentication without coupling the capture service to route composition. */
export async function resolveCapturePrincipal(
  request: Request,
  dependencies: CapturePrincipalDependencies,
  now = new Date()
): Promise<AuthPrincipal | undefined> {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    try {
      return await authenticateCaptureToken(request, dependencies, now);
    } catch (error) {
      if (error instanceof AuthError && error.code === "UNAUTHORIZED") return undefined;
      throw error;
    }
  }

  try {
    const context = await dependencies.resolveSessionContext(request);
    return { kind: "session", context };
  } catch (error) {
    if (error instanceof AccessDeniedError) return undefined;
    throw error;
  }
}

/** Only legacy POST /api/items may opt into this compatibility check. */
export function verifyLegacyCaptureToken(request: Request, configuredToken?: string): boolean {
  if (!configuredToken) return false;
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  return Boolean(match?.[1] && safeTokenEqual(match[1], configuredToken));
}
