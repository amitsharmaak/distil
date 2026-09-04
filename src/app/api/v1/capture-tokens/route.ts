import { issueCaptureToken } from "@/lib/auth/capture-tokens";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { AuthError, errorResponse } from "@/lib/auth/errors";
import { requireRequestSession, requireSessionMutation } from "@/lib/auth/route-helpers";
import { getRepositorySet } from "@/lib/database";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireRequestSession(request, readAuthEnvironment());
    const repositories = await getRepositorySet();
    return Response.json({ tokens: await repositories.captureTokens.list() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSessionMutation(request, readAuthEnvironment());
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

    const repositories = await getRepositorySet();
    const token = await issueCaptureToken(repositories.captureTokens, name);
    return Response.json({ token }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
