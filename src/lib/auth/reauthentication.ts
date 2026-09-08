import { resolveNeonAuthRequest, type ProviderIdentityPort } from "@/lib/auth/request-context";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import { requireAllowedOrigin } from "@/lib/auth/origin";

export interface ReauthenticationProvider extends ProviderIdentityPort {
  signIn: {
    magicLink(input: {
      email: string;
      callbackURL: string;
      newUserCallbackURL: string;
      errorCallbackURL: string;
    }): Promise<{ error: unknown | null }>;
  };
}

/**
 * Starts a new provider authentication ceremony for the already mapped account.
 * The current session selects the verified email; callers cannot supply an identity.
 */
export function createReauthenticationHandler(dependencies: {
  provider: ReauthenticationProvider;
  repositories: AuthRepositoryPort;
  appOrigin: string;
}) {
  return async function POST(request: Request): Promise<Response> {
    try {
      requireAllowedOrigin(request, new Set([dependencies.appOrigin]));
      const resolved = await resolveNeonAuthRequest(
        dependencies.provider,
        dependencies.repositories,
        request.headers.get("x-trace-id") ?? undefined
      );
      const result = await dependencies.provider.signIn.magicLink({
        email: resolved.identity.email,
        callbackURL: new URL("/account?reauthenticated=1", dependencies.appOrigin).toString(),
        newUserCallbackURL: new URL("/access-denied", dependencies.appOrigin).toString(),
        errorCallbackURL: new URL("/access-denied", dependencies.appOrigin).toString(),
      });
      if (result.error) throw new Error("provider rejected reauthentication");
      return Response.json({ accepted: true }, { status: 202 });
    } catch {
      return Response.json(
        { error: { code: "AUTH_UNAVAILABLE", message: "Unable to continue" } },
        { status: 503 }
      );
    }
  };
}
