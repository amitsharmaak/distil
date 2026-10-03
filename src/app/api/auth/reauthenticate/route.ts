import { readApplicationOrigin } from "@/lib/auth/app-origin";
import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";
import { neonMagicLinkProvider } from "@/lib/auth/magic-link";
import { getNeonAuthServer } from "@/lib/auth/neon-server";
import { createReauthenticationHandler } from "@/lib/auth/reauthentication";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { readAuthEnvironment } from "@/lib/auth/environment";

export async function POST(request: Request): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const auth = getNeonAuthServer();
    const stateSecret = process.env.NEON_AUTH_COOKIE_SECRET;
    if (!stateSecret) throw new Error("NEON_AUTH_COOKIE_SECRET is not configured");
    return createReauthenticationHandler({
      provider: neonMagicLinkProvider(auth),
      repositories: await getAuthRepositoryPort(),
      appOrigin: readApplicationOrigin(),
      stateSecret,
    })(request);
  } catch {
    return Response.json(
      { error: { code: "AUTH_UNAVAILABLE", message: "Unable to continue" } },
      { status: 503 }
    );
  }
}
