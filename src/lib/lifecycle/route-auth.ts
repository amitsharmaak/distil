import { AccessDeniedError } from "@/lib/auth/account";
import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";
import { readNeonAuthFoundation } from "@/lib/auth/neon-auth-foundation";
import { readProviderIdentity, requireFreshAuthentication } from "@/lib/auth/request-context";
import { getNeonAuthServer } from "@/lib/auth/neon-server";
import { createAuthContext, requestIdSchema, sessionIdSchema } from "@/lib/contracts";
import { getTenantRepositories } from "@/lib/database";

import { LifecycleError } from "./errors";

export async function requireLifecycleRoute(
  request: Request,
  input: { fresh?: boolean; allowDeletionPending?: boolean } = {}
) {
  const foundation = readNeonAuthFoundation();
  if (!foundation.enabled || foundation.status !== "ready") {
    throw new LifecycleError("NOT_FOUND", 404, "Not found");
  }
  const identity = await readProviderIdentity(getNeonAuthServer());
  const account = await (
    await getAuthRepositoryPort()
  ).findAccountByIdentity({
    provider: identity.provider,
    providerSubject: identity.subject,
  });
  if (!account) throw new AccessDeniedError("unmapped");
  const allowed =
    account.status === "active" ||
    (input.allowDeletionPending && account.status === "deletion_pending");
  if (!allowed) throw new AccessDeniedError("disabled");
  const now = new Date();
  const freshUntil = new Date(identity.authenticatedAt.getTime() + 10 * 60 * 1000);
  if (input.fresh) {
    requireFreshAuthentication({
      authenticatedAt: identity.authenticatedAt.toISOString(),
      freshUntil: freshUntil.toISOString(),
      isFresh: now.getTime() <= freshUntil.getTime(),
    });
  }
  const requestId = requestIdSchema.safeParse(request.headers.get("x-trace-id"));
  const sessionId = sessionIdSchema.safeParse(identity.sessionId);
  const context = createAuthContext({
    userId: account.userId,
    actorKind: "user",
    actorId: account.userId,
    requestId: requestId.success ? requestId.data : requestIdSchema.parse(crypto.randomUUID()),
    ...(sessionId.success ? { sessionId: sessionId.data } : {}),
  });
  return { context, account, repositories: await getTenantRepositories(context) };
}
