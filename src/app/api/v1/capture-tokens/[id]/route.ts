import { readAuthEnvironment } from "@/lib/auth/environment";
import { AuthError, errorResponse } from "@/lib/auth/errors";
import { requireSessionMutation } from "@/lib/auth/route-helpers";
import { getRepositorySet } from "@/lib/database";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireSessionMutation(request, readAuthEnvironment());
    const { id } = await context.params;
    if (!id) throw new AuthError("INVALID_REQUEST", 400, "Token id is required");
    const repositories = await getRepositorySet();
    const revoked = await repositories.captureTokens.revoke(id, new Date().toISOString());
    if (!revoked) throw new AuthError("CAPTURE_NOT_FOUND", 404, "Capture token not found");
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
