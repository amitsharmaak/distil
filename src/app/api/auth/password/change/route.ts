import { readApplicationOrigin } from "@/lib/auth/app-origin";
import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";
import { getNeonAuthServer } from "@/lib/auth/neon-server";
import { createPasswordChangeHandler, neonPasswordProvider } from "@/lib/auth/password-login";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { readAuthEnvironment } from "@/lib/auth/environment";

export async function POST(request: Request): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const auth = getNeonAuthServer();
    const appOrigin = readApplicationOrigin();
    return createPasswordChangeHandler({
      provider: neonPasswordProvider(auth, appOrigin),
      repositories: await getAuthRepositoryPort(),
      appOrigin,
    })(request);
  } catch {
    return Response.json(
      { error: { code: "AUTH_UNAVAILABLE", message: "Unable to continue" } },
      { status: 503 }
    );
  }
}
