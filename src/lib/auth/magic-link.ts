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
  }): Promise<{ error: unknown | null; setCookieHeaders?: string[] }>;
}

/** Exchange Neon's one-time callback verifier before resolving the invited identity. */
export async function exchangeMagicLinkSession<TRequest extends Request>(
  request: TRequest,
  middleware: (request: TRequest) => Promise<Response>
): Promise<Response | undefined> {
  const response = await middleware(request);
  return response.headers.get("x-middleware-next") === "1" ? undefined : response;
}

export function neonMagicLinkProvider(auth: {
  getSession: ProviderIdentityPort["getSession"];
  handler(): {
    POST(
      request: Request,
      context: { params: Promise<{ path: string[] }> }
    ): Promise<Response>;
  };
}): MagicLinkProvider {
  return {
    getSession: () => auth.getSession(),
    requestMagicLink: async (input) => {
      const response = await auth.handler().POST(
        new Request(new URL("/api/auth/sign-in/magic-link", input.callbackURL), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: new URL(input.callbackURL).origin,
          },
          body: JSON.stringify(input),
        }),
        { params: Promise.resolve({ path: ["sign-in", "magic-link"] }) }
      );
      return {
        error: response.ok ? null : new Error("provider rejected magic link"),
        setCookieHeaders: response.headers.getSetCookie(),
      };
    },
  };
}

export function createMagicLinkRequestHandler(dependencies: {
  provider: MagicLinkProvider;
  repositories: AuthRepositoryPort;
  appOrigin: string;
  stateSecret: string;
  now?: () => Date;
}) {
  return async function POST(request: Request): Promise<Response> {
    let dispatchClaim: { invitationId: string; claimId: string } | undefined;
    let providerAccepted = false;
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
      const now = dependencies.now?.() ?? new Date();
      const invitation = await validateInvitation(
        body.invitationToken,
        body.email,
        dependencies.repositories,
        now
      );
      const claimId = crypto.randomUUID();
      const claimed = await dependencies.repositories.claimInvitationDispatch({
        ...invitation,
        claimId,
      });
      const accepted = async () => {
        const response = NextResponse.json({ accepted: true }, { status: 202 });
        response.cookies.set(
          PENDING_INVITATION_COOKIE,
          await sealPendingInvitation(
            { token: body.invitationToken as string, nextPath: body.next },
            dependencies.stateSecret,
            now
          ),
          pendingInvitationCookieOptions
        );
        return response;
      };
      if (!claimed) return accepted();
      dispatchClaim = { invitationId: invitation.invitationId, claimId };
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
      providerAccepted = true;
      const completed = await dependencies.repositories.completeInvitationDispatch({
        ...dispatchClaim,
      });
      if (!completed) throw new Error("magic link dispatch claim was lost");
      dispatchClaim = undefined;
      const response = await accepted();
      for (const setCookie of result.setCookieHeaders ?? []) {
        response.headers.append("set-cookie", setCookie);
      }
      return response;
    } catch (error) {
      if (dispatchClaim && !providerAccepted) {
        try {
          await dependencies.repositories.failInvitationDispatch({
            ...dispatchClaim,
          });
        } catch {
          // The durable lease bounds recovery even when releasing the claim fails.
        }
      }
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
