import { issueCaptureToken } from "@/lib/auth/capture-tokens";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { AccessDeniedError } from "@/lib/auth/account";
import { authFailureResponse } from "@/lib/auth/http";
import { errorResponse } from "@/lib/auth/errors";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getTenantRepositories } from "@/lib/database";

const failure = (error: unknown) =>
  error instanceof AccessDeniedError ? authFailureResponse(error) : errorResponse(error);

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await resolveRequestAuthContext(request);
    const repositories = await getTenantRepositories(context);
    return Response.json(
      // Manual tokens only: browser connections are listed by /api/v1/extension/connections.
      { tokens: await repositories.captureTokens.list("manual") },
      { headers: { "cache-control": "private, no-store" } }
    );
  } catch (error) {
    return failure(error);
  }
}

/** Generates the account's single capture token, revoking any previous one. */
export async function POST(request: Request): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const context = await resolveRequestAuthContext(request);
    const repositories = await getTenantRepositories(context);
    const token = await issueCaptureToken(context, repositories.captureTokens);
    return Response.json({ token }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
