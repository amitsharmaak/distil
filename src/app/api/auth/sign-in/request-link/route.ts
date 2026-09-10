import { readApplicationOrigin } from "@/lib/auth/app-origin";
import {
  createReturningMagicLinkRequestHandler,
  neonMagicLinkProvider,
} from "@/lib/auth/magic-link";
import { getNeonAuthServer } from "@/lib/auth/neon-server";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";
import { requestIp } from "@/lib/auth/request";
import { createAuthContext, requestIdSchema } from "@/lib/contracts";
import { getTenantRepositories } from "@/lib/database";

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = getNeonAuthServer();
    return createReturningMagicLinkRequestHandler({
      provider: neonMagicLinkProvider(auth),
      repositories: await getAuthRepositoryPort(),
      appOrigin: readApplicationOrigin(),
      beforeDispatch: async (account, currentRequest) => {
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
          key: `returning-login:${requestIp(currentRequest)}`,
          operation: "returning-login",
          limit: 5,
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
