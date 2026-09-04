import type { AuthPrincipal } from "@/lib/contracts/capture";
import {
  CAPTURE_RATE_LIMIT,
  CAPTURE_RATE_LIMIT_WINDOW_SECONDS,
  CAPTURE_TOKEN_PREFIX,
} from "@/lib/auth/constants";
import { hashCaptureToken, safeTokenEqual } from "@/lib/auth/capture-tokens";
import { AuthError } from "@/lib/auth/errors";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { readSessionCookie } from "@/lib/auth/request";
import { verifySessionToken } from "@/lib/auth/session";
import type { CaptureTokenRepository, RateLimitRepository } from "@/lib/repositories/ports";

export interface CaptureAuthRepositories {
  captureTokens: CaptureTokenRepository;
  rateLimits: RateLimitRepository;
}

export interface CapturePrincipalDependencies extends CaptureAuthRepositories {
  sessionSecret: string;
}

export async function authenticateCaptureToken(
  request: Request,
  repositories: CaptureAuthRepositories,
  now = new Date()
): Promise<AuthPrincipal> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  const token = match?.[1];
  if (!token?.startsWith(CAPTURE_TOKEN_PREFIX)) {
    throw new AuthError("UNAUTHORIZED", 401, "A valid capture token is required");
  }

  const record = await repositories.captureTokens.findActiveByHash(hashCaptureToken(token));
  if (!record) throw new AuthError("UNAUTHORIZED", 401, "A valid capture token is required");

  await enforceRateLimit(repositories.rateLimits, {
    key: `capture-token:${record.id}`,
    limit: CAPTURE_RATE_LIMIT,
    windowSeconds: CAPTURE_RATE_LIMIT_WINDOW_SECONDS,
    now,
  });
  await repositories.captureTokens.touchLastUsed(record.id, now.toISOString());
  return { kind: "capture-token", tokenId: record.id };
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

  const session = readSessionCookie(request);
  if (await verifySessionToken(session, dependencies.sessionSecret, now))
    return { kind: "session" };
  return undefined;
}

/** Only legacy POST /api/items may opt into this compatibility check. */
export function verifyLegacyCaptureToken(request: Request, configuredToken?: string): boolean {
  if (!configuredToken) return false;
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  return Boolean(match?.[1] && safeTokenEqual(match[1], configuredToken));
}
