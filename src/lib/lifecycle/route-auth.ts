import { AccessDeniedError } from "@/lib/auth/account";
import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";
import { readNeonAuthFoundation } from "@/lib/auth/neon-auth-foundation";
import { FRESH_AUTH_WINDOW_MS, readProviderIdentity } from "@/lib/auth/request-context";
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
  const freshUntil = new Date(identity.authenticatedAt.getTime() + FRESH_AUTH_WINDOW_MS);
  if (input.fresh && now.getTime() > freshUntil.getTime()) {
    // Neon Auth 0.5.0-beta has no reauthentication endpoint. Do not treat its
    // ordinary session-expiry refresh as proof of a new authentication event.
    throw new LifecycleError(
      "FRESH_AUTH_REQUIRED",
      403,
      "Recent authentication is required for this account action",
      { kind: "CONTACT_OPERATOR_FOR_NEW_INVITATION" }
    );
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
