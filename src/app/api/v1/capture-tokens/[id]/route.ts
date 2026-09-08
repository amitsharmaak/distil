import { readAuthEnvironment } from "@/lib/auth/environment";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { AccessDeniedError } from "@/lib/auth/account";
import { authFailureResponse } from "@/lib/auth/http";
import { AuthError, errorResponse } from "@/lib/auth/errors";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getTenantRepositories } from "@/lib/database";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const authContext = await resolveRequestAuthContext(request);
    const { id } = await context.params;
    if (!id) throw new AuthError("INVALID_REQUEST", 400, "Token id is required");
    const repositories = await getTenantRepositories(authContext);
    const revoked = await repositories.captureTokens.revoke(id, new Date().toISOString());
    if (!revoked) throw new AuthError("CAPTURE_NOT_FOUND", 404, "Capture token not found");
    return new Response(null, { status: 204 });
  } catch (error) {
    return error instanceof AccessDeniedError ? authFailureResponse(error) : errorResponse(error);
  }
}
