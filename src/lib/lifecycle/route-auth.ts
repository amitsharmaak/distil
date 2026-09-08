import { AccessDeniedError } from "@/lib/auth/account";
import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";
import { readNeonAuthFoundation } from "@/lib/auth/neon-auth-foundation";
import { resolveNeonLifecycleRecoveryRequest } from "@/lib/auth/request-context";
import { getNeonAuthServer } from "@/lib/auth/neon-server";
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
  const resolved = await resolveNeonLifecycleRecoveryRequest(
    getNeonAuthServer(),
    await getAuthRepositoryPort(),
    request.headers.get("x-trace-id") ?? undefined
  );
  const { account, context } = resolved;
  const allowed =
    account.status === "active" ||
    (input.allowDeletionPending && account.status === "deletion_pending");
  if (!allowed) throw new AccessDeniedError("disabled");
  if (input.fresh && !resolved.freshAuth.isFresh) {
    // Neon Auth 0.5.0-beta has no reauthentication endpoint. Do not treat its
    // ordinary session-expiry refresh as proof of a new authentication event.
    throw new LifecycleError(
      "FRESH_AUTH_REQUIRED",
      403,
      "Recent authentication is required for this account action",
      { kind: "CONTACT_OPERATOR_FOR_NEW_INVITATION" }
    );
  }
  return { context, account, repositories: await getTenantRepositories(context) };
}
