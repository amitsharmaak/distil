import { createMagicLinkRequestHandler } from "@/lib/auth/magic-link";
import { issueInvitation } from "@/lib/auth/invitations";
import { openPendingInvitation, PENDING_INVITATION_COOKIE } from "@/lib/auth/invite-state";
import type { AuthRepositoryPort, InvitationRecord } from "@/lib/auth/ports";

const origin = "https://distil.example";
const stateSecret = "state-secret-that-is-at-least-thirty-two-characters";
const actorId = "10000000-0000-4000-8000-000000000001";

function repository(): AuthRepositoryPort & { invitation?: InvitationRecord } {
  const result: AuthRepositoryPort & { invitation?: InvitationRecord } = {
    createInvitation: jest.fn(async (record) => {
      result.invitation = record;
    }),
    findInvitationById: jest.fn(async (id) =>
      result.invitation?.id === id ? result.invitation : undefined
    ),
    revokeInvitation: jest.fn(),
    consumeInvitationAndLinkIdentity: jest.fn(),
    findAccountByIdentity: jest.fn(),
  };
  return result;
}

function cookieValue(setCookie: string): string {
  const pair = setCookie.split(";", 1)[0];
  return decodeURIComponent(pair.slice(pair.indexOf("=") + 1));
}

describe("invitation-gated magic links", () => {
  it("validates the invitation before provider dispatch and fixes every callback origin", async () => {
    const repositories = repository();
    const invitation = await issueInvitation(
      {
        action: "issue",
        email: "amit@example.com",
        issuedByActorId: actorId,
        reason: "Pilot",
        appOrigin: origin,
      },
      repositories
    );
    const provider = {
      getSession: jest.fn(),
      requestMagicLink: jest.fn().mockResolvedValue({ error: null }),
    };
    const handler = createMagicLinkRequestHandler({
      provider,
      repositories,
      appOrigin: origin,
      stateSecret,
    });
    const response = await handler(
      new Request(`${origin}/api/auth/invitations/request-link`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({
          email: "AMIT@example.com",
          invitationToken: new URLSearchParams(new URL(invitation.invitationUrl).hash.slice(1)).get(
            "token"
          ),
          next: "https://hostile.example/steal",
        }),
      })
    );
    expect(response.status).toBe(202);
    expect(provider.requestMagicLink).toHaveBeenCalledWith({
      email: "AMIT@example.com",
      callbackURL: `${origin}/api/auth/invitations/complete`,
      newUserCallbackURL: `${origin}/api/auth/invitations/complete`,
      errorCallbackURL: `${origin}/access-denied`,
    });
    const setCookie = response.headers.get("set-cookie")!;
    expect(setCookie).toContain(`${PENDING_INVITATION_COOKIE}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    await expect(openPendingInvitation(cookieValue(setCookie), stateSecret)).resolves.toMatchObject(
      { nextPath: "/" }
    );
  });

  it("never dispatches a provider request for a wrong email, invalid invite, or hostile origin", async () => {
    const repositories = repository();
    const provider = {
      getSession: jest.fn(),
      requestMagicLink: jest.fn().mockResolvedValue({ error: null }),
    };
    const handler = createMagicLinkRequestHandler({
      provider,
      repositories,
      appOrigin: origin,
      stateSecret,
    });
    for (const request of [
      new Request(`${origin}/api/auth/invitations/request-link`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ email: "amit@example.com", invitationToken: "invalid" }),
      }),
      new Request(`${origin}/api/auth/invitations/request-link`, {
        method: "POST",
        headers: { origin: "https://hostile.example", "content-type": "application/json" },
        body: JSON.stringify({ email: "amit@example.com", invitationToken: "invalid" }),
      }),
    ]) {
      const response = await handler(request);
      expect([403, 503]).toContain(response.status);
      await expect(response.json()).resolves.toMatchObject({
        error: { message: "Unable to continue" },
      });
    }
    expect(provider.requestMagicLink).not.toHaveBeenCalled();
  });
});
