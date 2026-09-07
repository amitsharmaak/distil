import { NextResponse } from "next/server";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { AccessDeniedError } from "@/lib/auth/account";
import { acceptInvitation, validateInvitation } from "@/lib/auth/invitations";
import {
  openPendingInvitation,
  pendingInvitationCookieOptions,
  PENDING_INVITATION_COOKIE,
  sealPendingInvitation,
} from "@/lib/auth/invite-state";
import { readCookie } from "@/lib/auth/request";
import { readProviderIdentity, type ProviderIdentityPort } from "@/lib/auth/request-context";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import { AuthError } from "@/lib/auth/errors";

export interface MagicLinkProvider extends ProviderIdentityPort {
  requestMagicLink(input: {
    email: string;
    callbackURL: string;
    newUserCallbackURL: string;
    errorCallbackURL: string;
  }): Promise<{ error: unknown | null }>;
}

export function neonMagicLinkProvider(auth: {
  getSession: ProviderIdentityPort["getSession"];
  signIn: {
    magicLink(input: {
      email: string;
      callbackURL?: string;
      newUserCallbackURL?: string;
      errorCallbackURL?: string;
    }): Promise<{ error: unknown | null }>;
  };
}): MagicLinkProvider {
  return {
    getSession: () => auth.getSession(),
    requestMagicLink: async (input) => auth.signIn.magicLink(input),
  };
}

export function createMagicLinkRequestHandler(dependencies: {
  provider: MagicLinkProvider;
  repositories: AuthRepositoryPort;
  appOrigin: string;
  stateSecret: string;
}) {
  return async function POST(request: Request): Promise<Response> {
    try {
      requireAllowedOrigin(request, new Set([dependencies.appOrigin]));
      const body = (await request.json()) as {
        email?: unknown;
        invitationToken?: unknown;
        next?: unknown;
      };
      if (typeof body.email !== "string" || typeof body.invitationToken !== "string") {
        throw new AccessDeniedError("unmapped");
      }
      await validateInvitation(body.invitationToken, body.email, dependencies.repositories);
      const completeUrl = new URL(
        "/api/auth/invitations/complete",
        dependencies.appOrigin
      ).toString();
      const deniedUrl = new URL("/access-denied", dependencies.appOrigin).toString();
      const result = await dependencies.provider.requestMagicLink({
        email: body.email,
        callbackURL: completeUrl,
        newUserCallbackURL: completeUrl,
        errorCallbackURL: deniedUrl,
      });
      if (result.error) throw new Error("provider rejected magic link");

      const response = NextResponse.json({ accepted: true }, { status: 202 });
      response.cookies.set(
        PENDING_INVITATION_COOKIE,
        await sealPendingInvitation(
          { token: body.invitationToken, nextPath: body.next },
          dependencies.stateSecret
        ),
        pendingInvitationCookieOptions
      );
      return response;
    } catch (error) {
      if (error instanceof AccessDeniedError || error instanceof AuthError) {
        return Response.json(
          { error: { code: "ACCESS_DENIED", message: "Unable to continue" } },
          { status: 403 }
        );
      }
      return Response.json(
        { error: { code: "AUTH_UNAVAILABLE", message: "Unable to continue" } },
        { status: 503 }
      );
    }
  };
}

export function createInvitationCompletionHandler(dependencies: {
  provider: ProviderIdentityPort;
  repositories: AuthRepositoryPort;
  appOrigin: string;
  stateSecret: string;
}) {
  return async function GET(request: Request): Promise<Response> {
    let destination = "/access-denied";
    try {
      const state = await openPendingInvitation(
        readCookie(request, PENDING_INVITATION_COOKIE),
        dependencies.stateSecret
      );
      if (!state) throw new AccessDeniedError("unmapped");
      const identity = await readProviderIdentity(dependencies.provider);
      await acceptInvitation(state.token, identity, dependencies.repositories);
      destination = state.nextPath;
    } catch {
      destination = "/access-denied";
    }
    const response = NextResponse.redirect(new URL(destination, dependencies.appOrigin));
    response.cookies.set(PENDING_INVITATION_COOKIE, "", {
      ...pendingInvitationCookieOptions,
      maxAge: 0,
    });
    return response;
  };
}
