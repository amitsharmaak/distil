import { createInvitationCompletionHandler, neonMagicLinkProvider } from "@/lib/auth/magic-link";
import { getNeonAuthServer } from "@/lib/auth/neon-server";
import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";
import { readApplicationOrigin } from "@/lib/auth/app-origin";

export async function GET(request: Request): Promise<Response> {
  let appOrigin: string;
  try {
    appOrigin = readApplicationOrigin();
    const auth = getNeonAuthServer();
    return createInvitationCompletionHandler({
      provider: neonMagicLinkProvider(auth),
      repositories: await getAuthRepositoryPort(),
      appOrigin,
      stateSecret: process.env.NEON_AUTH_COOKIE_SECRET!,
    })(request);
  } catch {
    const fallbackOrigin = process.env.NEXT_PUBLIC_API_BASE_URL ?? new URL(request.url).origin;
    return Response.redirect(new URL("/access-denied", fallbackOrigin));
  }
}
