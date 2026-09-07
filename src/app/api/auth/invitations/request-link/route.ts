import { createMagicLinkRequestHandler, neonMagicLinkProvider } from "@/lib/auth/magic-link";
import { getNeonAuthServer, NeonAuthConfigurationError } from "@/lib/auth/neon-server";
import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";
import { readApplicationOrigin } from "@/lib/auth/app-origin";

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = getNeonAuthServer();
    return createMagicLinkRequestHandler({
      provider: neonMagicLinkProvider(auth),
      repositories: await getAuthRepositoryPort(),
      appOrigin: readApplicationOrigin(),
      stateSecret: process.env.NEON_AUTH_COOKIE_SECRET!,
    })(request);
  } catch (error) {
    const status = error instanceof NeonAuthConfigurationError ? 503 : 503;
    return Response.json(
      { error: { code: "AUTH_UNAVAILABLE", message: "Unable to continue" } },
      { status }
    );
  }
}
