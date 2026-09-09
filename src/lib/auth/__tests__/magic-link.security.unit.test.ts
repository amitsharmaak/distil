import {
  createInvitationCompletionHandler,
  createMagicLinkRequestHandler,
  exchangeMagicLinkSession,
  NEON_AUTH_SESSION_CHALLENGE_COOKIE,
  neonMagicLinkProvider,
} from "@/lib/auth/magic-link";
import { issueInvitation } from "@/lib/auth/invitations";
import {
  openPendingInvitation,
  PENDING_INVITATION_COOKIE,
  sealPendingInvitation,
} from "@/lib/auth/invite-state";
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
    claimInvitationDispatch: jest.fn().mockResolvedValue(true),
    completeInvitationDispatch: jest.fn().mockResolvedValue(true),
    failInvitationDispatch: jest.fn().mockResolvedValue(true),
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
  it("returns the provider verifier-exchange redirect before invitation completion", async () => {
    const redirect = Response.redirect(`${origin}/api/auth/invitations/complete`, 307);
    const middleware = jest.fn(async () => redirect);

    await expect(
      exchangeMagicLinkSession(
        new Request(`${origin}/api/auth/invitations/complete?neon_auth_session_verifier=value`),
        middleware
      )
    ).resolves.toBe(redirect);
  });

  it("continues invitation completion after provider middleware allows the request", async () => {
    const middleware = jest.fn(
      async () => new Response(null, { headers: { "x-middleware-next": "1" } })
    );

    await expect(
      exchangeMagicLinkSession(new Request(`${origin}/api/auth/invitations/complete`), middleware)
    ).resolves.toBeUndefined();
  });

  it("adapts the Neon provider without widening callback inputs", async () => {
    const session = { data: null, error: null };
    const post = jest
      .fn()
      .mockResolvedValue(
        Response.json({ ok: true }, { headers: { "set-cookie": "challenge=value" } })
      );
    const auth = {
      getSession: jest.fn().mockResolvedValue(session),
      handler: () => ({ POST: post }),
    };
    const provider = neonMagicLinkProvider(auth);
    await expect(provider.getSession()).resolves.toBe(session);
    const input = {
      email: "amit@example.com",
      callbackURL: `${origin}/api/auth/invitations/complete`,
      newUserCallbackURL: `${origin}/api/auth/invitations/complete`,
      errorCallbackURL: `${origin}/access-denied`,
    };
    await expect(provider.requestMagicLink(input)).resolves.toEqual({
      error: null,
      setCookieHeaders: ["challenge=value"],
    });
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST" }),
      expect.objectContaining({ params: expect.any(Promise) })
    );
  });

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
      requestMagicLink: jest.fn().mockResolvedValue({
        error: null,
        setCookieHeaders: [
          "__Secure-neon-auth.provider_hint=value; Path=/; HttpOnly; Secure; SameSite=Lax",
        ],
      }),
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
    expect(setCookie).toContain("__Secure-neon-auth.provider_hint=value");
    expect(setCookie).toContain(`${NEON_AUTH_SESSION_CHALLENGE_COOKIE}=`);
    await expect(openPendingInvitation(cookieValue(setCookie), stateSecret)).resolves.toMatchObject(
      { nextPath: "/" }
    );
  });

  it("lets only one concurrent valid request cross the provider dispatch boundary", async () => {
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
    const token = new URLSearchParams(new URL(invitation.invitationUrl).hash.slice(1)).get(
      "token"
    )!;
    let activeClaim = false;
    let dispatched = false;
    jest.mocked(repositories.claimInvitationDispatch).mockImplementation(async () => {
      if (activeClaim || dispatched) return false;
      activeClaim = true;
      return true;
    });
    jest.mocked(repositories.completeInvitationDispatch).mockImplementation(async () => {
      activeClaim = false;
      dispatched = true;
      return true;
    });
    let releaseProvider!: () => void;
    let markProviderStarted!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      markProviderStarted = resolve;
    });
    const providerGate = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const provider = {
      getSession: jest.fn(),
      requestMagicLink: jest.fn(async () => {
        markProviderStarted();
        await providerGate;
        return { error: null };
      }),
    };
    const handler = createMagicLinkRequestHandler({
      provider,
      repositories,
      appOrigin: origin,
      stateSecret,
    });
    const request = () =>
      new Request(`${origin}/api/auth/invitations/request-link`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ email: "amit@example.com", invitationToken: token }),
      });

    const first = handler(request());
    await providerStarted;
    const replay = await handler(request());
    expect(replay.status).toBe(202);
    expect(provider.requestMagicLink).toHaveBeenCalledTimes(1);
    releaseProvider();
    await expect(first).resolves.toMatchObject({ status: 202 });
    expect(repositories.completeInvitationDispatch).toHaveBeenCalledTimes(1);
    await expect(handler(request())).resolves.toMatchObject({ status: 202 });
    expect(provider.requestMagicLink).toHaveBeenCalledTimes(1);
  });

  it("releases provider failures into a bounded retry instead of permanently locking the invite", async () => {
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
    const token = new URLSearchParams(new URL(invitation.invitationUrl).hash.slice(1)).get(
      "token"
    )!;
    let clock = new Date("2026-09-08T08:00:00.000Z");
    let claimed = false;
    let retryAt = 0;
    jest.mocked(repositories.claimInvitationDispatch).mockImplementation(async () => {
      if (claimed || clock.getTime() < retryAt) return false;
      claimed = true;
      return true;
    });
    jest.mocked(repositories.failInvitationDispatch).mockImplementation(async () => {
      claimed = false;
      retryAt = clock.getTime() + 5_000;
      return true;
    });
    jest.mocked(repositories.completeInvitationDispatch).mockImplementation(async () => {
      claimed = false;
      return true;
    });
    const provider = {
      getSession: jest.fn(),
      requestMagicLink: jest
        .fn()
        .mockResolvedValueOnce({ error: new Error("private provider detail") })
        .mockResolvedValueOnce({ error: null }),
    };
    const handler = createMagicLinkRequestHandler({
      provider,
      repositories,
      appOrigin: origin,
      stateSecret,
      now: () => clock,
    });
    const request = () =>
      new Request(`${origin}/api/auth/invitations/request-link`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ email: "amit@example.com", invitationToken: token }),
      });

    await expect(handler(request())).resolves.toMatchObject({ status: 503 });
    await expect(handler(request())).resolves.toMatchObject({ status: 202 });
    expect(provider.requestMagicLink).toHaveBeenCalledTimes(1);
    clock = new Date(clock.getTime() + 5_000);
    await expect(handler(request())).resolves.toMatchObject({ status: 202 });
    expect(provider.requestMagicLink).toHaveBeenCalledTimes(2);
    expect(repositories.failInvitationDispatch).toHaveBeenCalledTimes(1);
  });

  it("keeps the lease when provider delivery succeeds but durable completion is unavailable", async () => {
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
    const token = new URLSearchParams(new URL(invitation.invitationUrl).hash.slice(1)).get(
      "token"
    )!;
    jest
      .mocked(repositories.completeInvitationDispatch)
      .mockRejectedValueOnce(new Error("database unavailable"));
    const provider = {
      getSession: jest.fn(),
      requestMagicLink: jest.fn().mockResolvedValue({ error: null }),
    };
    const response = await createMagicLinkRequestHandler({
      provider,
      repositories,
      appOrigin: origin,
      stateSecret,
    })(
      new Request(`${origin}/api/auth/invitations/request-link`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ email: "amit@example.com", invitationToken: token }),
      })
    );
    expect(response.status).toBe(503);
    expect(provider.requestMagicLink).toHaveBeenCalledTimes(1);
    expect(repositories.failInvitationDispatch).not.toHaveBeenCalled();
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

  it.each([{ invitationToken: "invalid" }, { email: "amit@example.com" }])(
    "rejects malformed input before provider dispatch",
    async (body) => {
      const provider = {
        getSession: jest.fn(),
        requestMagicLink: jest.fn().mockResolvedValue({ error: null }),
      };
      const response = await createMagicLinkRequestHandler({
        provider,
        repositories: repository(),
        appOrigin: origin,
        stateSecret,
      })(
        new Request(`${origin}/api/auth/invitations/request-link`, {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify(body),
        })
      );
      expect(response.status).toBe(403);
      expect(provider.requestMagicLink).not.toHaveBeenCalled();
    }
  );

  it("redacts provider and malformed-JSON failures as unavailable", async () => {
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
    const token = new URLSearchParams(new URL(invitation.invitationUrl).hash.slice(1)).get(
      "token"
    )!;
    const provider = {
      getSession: jest.fn(),
      requestMagicLink: jest.fn().mockResolvedValue({ error: new Error("provider detail") }),
    };
    const handler = createMagicLinkRequestHandler({
      provider,
      repositories,
      appOrigin: origin,
      stateSecret,
    });
    const providerResponse = await handler(
      new Request(`${origin}/api/auth/invitations/request-link`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ email: "amit@example.com", invitationToken: token }),
      })
    );
    expect(providerResponse.status).toBe(503);
    await expect(providerResponse.json()).resolves.toEqual({
      error: { code: "AUTH_UNAVAILABLE", message: "Unable to continue" },
    });

    const malformedResponse = await handler(
      new Request(`${origin}/api/auth/invitations/request-link`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: "{",
      })
    );
    expect(malformedResponse.status).toBe(503);
  });

  it("accepts a sealed invitation, redirects safely, and clears one-time state", async () => {
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
    const token = new URLSearchParams(new URL(invitation.invitationUrl).hash.slice(1)).get(
      "token"
    )!;
    jest.mocked(repositories.consumeInvitationAndLinkIdentity).mockResolvedValue({
      userId: "20000000-0000-4000-8000-000000000002",
      primaryEmail: "amit@example.com",
      status: "active",
    } as never);
    const provider = {
      getSession: jest.fn().mockResolvedValue({
        data: {
          user: {
            id: "provider-subject",
            email: "amit@example.com",
            emailVerified: true,
          },
          session: { id: "provider-session", createdAt: new Date() },
        },
        error: null,
      }),
    };
    const state = await sealPendingInvitation({ token, nextPath: "/feed" }, stateSecret);
    const response = await createInvitationCompletionHandler({
      provider,
      repositories,
      appOrigin: origin,
      stateSecret,
    })(
      new Request(`${origin}/api/auth/invitations/complete`, {
        headers: { cookie: `${PENDING_INVITATION_COOKIE}=${encodeURIComponent(state)}` },
      })
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${origin}/feed`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(repositories.consumeInvitationAndLinkIdentity).toHaveBeenCalledTimes(1);
  });

  it("fails closed and clears missing or invalid completion state", async () => {
    const response = await createInvitationCompletionHandler({
      provider: { getSession: jest.fn() },
      repositories: repository(),
      appOrigin: origin,
      stateSecret,
    })(new Request(`${origin}/api/auth/invitations/complete`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${origin}/access-denied`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
