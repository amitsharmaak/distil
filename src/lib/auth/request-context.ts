import { createAuthContext, requestIdSchema, sessionIdSchema, userIdSchema } from "@/lib/contracts";
import { readSessionCookie } from "@/lib/auth/request";
import { verifySessionToken } from "@/lib/auth/session";
import {
  AccessDeniedError,
  type FreshAuthMarker,
  type ProviderIdentity,
  type ResolvedAuthRequest,
} from "@/lib/auth/account";
import type { AuthRepositoryPort } from "@/lib/auth/ports";

export const FRESH_AUTH_WINDOW_MS = 10 * 60 * 1000;

export interface ProviderSessionResult {
  data: null | {
    user: { id: string; email: string; emailVerified: boolean };
    session: { id: string; createdAt: Date | string };
  };
  error: unknown | null;
}

export interface ProviderIdentityPort {
  getSession(): Promise<ProviderSessionResult>;
}

export function freshAuthMarker(
  authenticatedAt: Date,
  now = new Date(),
  windowMs = FRESH_AUTH_WINDOW_MS
): FreshAuthMarker {
  const freshUntil = new Date(authenticatedAt.getTime() + windowMs);
  return {
    authenticatedAt: authenticatedAt.toISOString(),
    freshUntil: freshUntil.toISOString(),
    isFresh: now.getTime() <= freshUntil.getTime(),
  };
}

export function requireFreshAuthentication(marker: FreshAuthMarker): void {
  if (!marker.isFresh) throw new AccessDeniedError("unauthenticated");
}

export async function readProviderIdentity(
  provider: ProviderIdentityPort
): Promise<ProviderIdentity> {
  const result = await provider.getSession();
  if (result.error || !result.data?.user || !result.data.session) {
    throw new AccessDeniedError("unauthenticated");
  }
  if (!result.data.user.emailVerified) throw new AccessDeniedError("unverified");
  return {
    provider: "neon",
    subject: result.data.user.id,
    email: result.data.user.email,
    emailVerified: true,
    sessionId: result.data.session.id,
    authenticatedAt: new Date(result.data.session.createdAt),
  };
}

async function resolveNeonAuthRequestWithPolicy(
  provider: ProviderIdentityPort,
  repositories: AuthRepositoryPort,
  requestId?: string,
  now = new Date(),
  allowDeletionPending = false
): Promise<ResolvedAuthRequest> {
  const identity = await readProviderIdentity(provider);
  const account = await repositories.findAccountByIdentity({
    provider: identity.provider,
    providerSubject: identity.subject,
  });
  if (!account) throw new AccessDeniedError("unmapped");
  if (
    account.status !== "active" &&
    !(allowDeletionPending && account.status === "deletion_pending")
  ) {
    throw new AccessDeniedError("disabled");
  }

  const parsedRequestId = requestIdSchema.safeParse(requestId);
  const parsedSessionId = sessionIdSchema.safeParse(identity.sessionId);
  return {
    context: createAuthContext({
      userId: account.userId,
      actorKind: "user",
      actorId: account.userId,
      requestId: parsedRequestId.success
        ? parsedRequestId.data
        : requestIdSchema.parse(crypto.randomUUID()),
      ...(parsedSessionId.success ? { sessionId: parsedSessionId.data } : {}),
    }),
    account,
    identity,
    freshAuth: freshAuthMarker(identity.authenticatedAt, now),
  };
}

export function resolveNeonAuthRequest(
  provider: ProviderIdentityPort,
  repositories: AuthRepositoryPort,
  requestId?: string,
  now = new Date()
): Promise<ResolvedAuthRequest> {
  return resolveNeonAuthRequestWithPolicy(provider, repositories, requestId, now);
}

/** Exact recovery capability for deletion status/cancellation and the Account shell. */
export function resolveNeonLifecycleRecoveryRequest(
  provider: ProviderIdentityPort,
  repositories: AuthRepositoryPort,
  requestId?: string,
  now = new Date()
): Promise<ResolvedAuthRequest> {
  return resolveNeonAuthRequestWithPolicy(provider, repositories, requestId, now, true);
}

export async function resolveLegacyAuthRequest(
  request: Request,
  input: { sessionSecret: string; legacyUserId: string; requestId?: string },
  now = new Date()
): Promise<ResolvedAuthRequest["context"]> {
  if (!(await verifySessionToken(readSessionCookie(request), input.sessionSecret, now))) {
    throw new AccessDeniedError("unauthenticated");
  }
  const userId = userIdSchema.parse(input.legacyUserId);
  const parsedRequestId = requestIdSchema.safeParse(input.requestId);
  return createAuthContext({
    userId,
    actorKind: "user",
    actorId: userId,
    requestId: parsedRequestId.success
      ? parsedRequestId.data
      : requestIdSchema.parse(crypto.randomUUID()),
  });
}
