import { issueCaptureToken } from "@/lib/auth/capture-tokens";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { AccessDeniedError } from "@/lib/auth/account";
import { authFailureResponse } from "@/lib/auth/http";
import { AuthError, errorResponse } from "@/lib/auth/errors";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getTenantRepositories } from "@/lib/database";

const failure = (error: unknown) =>
  error instanceof AccessDeniedError ? authFailureResponse(error) : errorResponse(error);

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await resolveRequestAuthContext(request);
    const repositories = await getTenantRepositories(context);
    return Response.json(
      { tokens: await repositories.captureTokens.list() },
      { headers: { "cache-control": "private, no-store" } }
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const context = await resolveRequestAuthContext(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AuthError("INVALID_REQUEST", 400, "A JSON token name is required");
    }
    const name = (body as { name?: unknown })?.name;
    if (typeof name !== "string" || !name.trim() || name.trim().length > 80) {
      throw new AuthError("INVALID_REQUEST", 400, "Token name must be 1-80 characters");
    }

    const repositories = await getTenantRepositories(context);
    const token = await issueCaptureToken(context, repositories.captureTokens, name);
    return Response.json({ token }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
