import { NextResponse } from "next/server";
import { resolveNeonAuthRequest } from "@/lib/auth/request-context";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { attachMagicLinkCookies, type MagicLinkProvider } from "@/lib/auth/magic-link";
import {
  pendingSignInNextCookieOptions,
  PENDING_SIGN_IN_NEXT_COOKIE,
  sealSignInNext,
} from "@/lib/auth/sign-in-next";

export type ReauthenticationProvider = MagicLinkProvider;

/** Where a completed reauthentication returns; the Account page reads the marker. */
export const REAUTHENTICATED_RETURN_PATH = "/account?reauthenticated=1";

/**
 * Starts a new provider authentication ceremony for the already mapped account.
 * The current session selects the verified email; callers cannot supply an identity.
 *
 * The emailed link completes through the same `/api/auth/sign-in/complete` route as a returning
 * sign-in: that route runs the SDK middleware, which exchanges the one-time callback verifier for
 * a new provider session (replacing the current session cookie) only when the session-challenge
 * cookie issued here is present. Landing on a page instead would leave the old session in place
 * and the fresh-authentication window never reopens. The return path is sealed and bound to the
 * requesting provider subject, so the "verified" landing is only shown to that same identity.
 */
export function createReauthenticationHandler(dependencies: {
  provider: ReauthenticationProvider;
  repositories: AuthRepositoryPort;
  appOrigin: string;
  stateSecret: string;
  now?: () => Date;
}) {
  return async function POST(request: Request): Promise<Response> {
    try {
      requireAllowedOrigin(request, new Set([dependencies.appOrigin]));
      const resolved = await resolveNeonAuthRequest(
        dependencies.provider,
        dependencies.repositories,
        request.headers.get("x-trace-id") ?? undefined
      );
      const sealedNext = sealSignInNext(
        REAUTHENTICATED_RETURN_PATH,
        dependencies.stateSecret,
        dependencies.now?.(),
        resolved.identity.subject
      );
      const result = await dependencies.provider.requestMagicLink({
        email: resolved.identity.email,
        callbackURL: new URL("/api/auth/sign-in/complete", dependencies.appOrigin).toString(),
        newUserCallbackURL: new URL("/access-denied", dependencies.appOrigin).toString(),
        errorCallbackURL: new URL("/access-denied", dependencies.appOrigin).toString(),
      });
      if (result.error) throw new Error("provider rejected reauthentication");
      const response = NextResponse.json({ accepted: true }, { status: 202 });
      response.cookies.set(PENDING_SIGN_IN_NEXT_COOKIE, sealedNext, pendingSignInNextCookieOptions);
      attachMagicLinkCookies(response, result.setCookieHeaders);
      return response;
    } catch {
      return Response.json(
        { error: { code: "AUTH_UNAVAILABLE", message: "Unable to continue" } },
        { status: 503 }
      );
    }
  };
}
