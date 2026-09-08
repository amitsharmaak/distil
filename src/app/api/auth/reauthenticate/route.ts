import { readApplicationOrigin } from "@/lib/auth/app-origin";
import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";
import { getNeonAuthServer } from "@/lib/auth/neon-server";
import { createReauthenticationHandler } from "@/lib/auth/reauthentication";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { readAuthEnvironment } from "@/lib/auth/environment";

export async function POST(request: Request): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const provider = getNeonAuthServer();
    return createReauthenticationHandler({
      provider,
      repositories: await getAuthRepositoryPort(),
      appOrigin: readApplicationOrigin(),
    })(request);
  } catch {
    return Response.json(
      { error: { code: "AUTH_UNAVAILABLE", message: "Unable to continue" } },
      { status: 503 }
    );
  }
}
