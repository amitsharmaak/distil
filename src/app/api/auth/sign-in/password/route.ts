import { readApplicationOrigin } from "@/lib/auth/app-origin";
import { createPasswordSignInHandler, neonPasswordProvider } from "@/lib/auth/password-login";
import { getNeonAuthServer } from "@/lib/auth/neon-server";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";
import { requestIp } from "@/lib/auth/request";
import { createAuthContext, requestIdSchema } from "@/lib/contracts";
import { getTenantRepositories } from "@/lib/database";

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = getNeonAuthServer();
    const appOrigin = readApplicationOrigin();
    return createPasswordSignInHandler({
      provider: neonPasswordProvider(auth, appOrigin),
      repositories: await getAuthRepositoryPort(),
      appOrigin,
      beforeAttempt: async (account, currentRequest) => {
        const parsedRequestId = requestIdSchema.safeParse(currentRequest.headers.get("x-trace-id"));
        const context = createAuthContext({
          userId: account.userId,
          actorKind: "system",
          actorId: account.userId,
          requestId: parsedRequestId.success
            ? parsedRequestId.data
            : requestIdSchema.parse(crypto.randomUUID()),
        });
        const repositories = await getTenantRepositories(context);
        await enforceRateLimit(repositories.rateLimits, {
          context,
          key: `password-login:${requestIp(currentRequest)}`,
          operation: "password-login",
          limit: 10,
          windowSeconds: 15 * 60,
        });
        await enforceRateLimit(repositories.rateLimits, {
          context,
          key: `password-login-account:${account.userId}`,
          operation: "password-login-account",
          limit: 10,
          windowSeconds: 15 * 60,
        });
      },
    })(request);
  } catch {
    return Response.json(
      { error: { code: "AUTH_UNAVAILABLE", message: "Unable to continue" } },
      { status: 503 }
    );
  }
}
