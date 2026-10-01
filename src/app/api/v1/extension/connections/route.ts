import { issueBrowserConnection } from "@/lib/auth/capture-tokens";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { AccessDeniedError } from "@/lib/auth/account";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { AuthError, errorResponse } from "@/lib/auth/errors";
import { authFailureResponse } from "@/lib/auth/http";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { getTenantRepositories } from "@/lib/database";

const noStore = { "cache-control": "private, no-store" };

const failure = (error: unknown) =>
  error instanceof AccessDeniedError ? authFailureResponse(error) : errorResponse(error);

/** Lists the caller's active browser connections. Hashes are never returned. */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await resolveRequestAuthContext(request);
    const repositories = await getTenantRepositories(context);
    const tokens = await repositories.captureTokens.list("browser");
    return Response.json(
      {
        connections: tokens
          .filter((token) => !token.revokedAt)
          .map((token) => ({
            id: token.id,
            label: token.label ?? "Browser",
            createdAt: token.createdAt,
            ...(token.lastUsedAt ? { lastUsedAt: token.lastUsedAt } : {}),
          })),
      },
      { headers: noStore }
    );
  } catch (error) {
    return failure(error);
  }
}

/**
 * Connects one browser: mints a token for it alone and returns the plaintext exactly once. The
 * caller is the signed-in user on the connect page; nothing here revokes another connection or the
 * account's manual token.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const context = await resolveRequestAuthContext(request);
    const body: unknown = await request.json().catch(() => ({}));
    const label =
      body && typeof body === "object" ? (body as { label?: unknown }).label : undefined;
    if (label !== undefined && typeof label !== "string") {
      throw new AuthError("INVALID_REQUEST", 400, "label must be a string");
    }
    const repositories = await getTenantRepositories(context);
    await enforceRateLimit(repositories.rateLimits, {
      context,
      key: `extension-connect:${context.userId}`,
      operation: "extension-connect",
      limit: 20,
      windowSeconds: 60 * 60,
    });
    const issued = await issueBrowserConnection(context, repositories.captureTokens, { label });
    return Response.json(
      {
        connection: { ...issued.connection, accountId: context.userId },
        token: issued.token,
      },
      { status: 201, headers: noStore }
    );
  } catch (error) {
    return failure(error);
  }
}
