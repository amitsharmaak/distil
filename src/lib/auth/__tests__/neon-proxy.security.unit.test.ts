import { NextRequest } from "next/server";
import {
  authorizeNeonProxy,
  hasSpecializedNeonAuth,
  isLifecycleRecoveryRequest,
  isPublicNeonPath,
  requiresNeonSessionOrigin,
  type NeonProxyProvider,
  type VerifiedProviderSession,
} from "@/lib/auth/neon-proxy";
import { IDENTITY_HEADER, verifyIdentityToken } from "@/lib/auth/identity-token";
import type { LinkedAccount } from "@/lib/auth/account";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import { userIdSchema } from "@/lib/contracts";

const userId = userIdSchema.parse("20000000-0000-4000-8000-000000000002");
const requestId = "30000000-0000-4000-8000-000000000003";
const sessionId = "40000000-0000-4000-8000-000000000004";
const allowedOrigins = new Set(["https://distil.example"]);
const identityTokenSecret = "neon-cookie-secret-that-is-at-least-thirty-two-bytes";
const refreshedCookie = "__Secure-neon-auth.local.session_data=refreshed; Path=/; HttpOnly";
const centrallyProtectedMutations = [
  "DELETE /api/ai/research/suggestions/:id",
  "DELETE /api/items/:id",
  "PATCH /api/items/:id",
  "PATCH /api/notifications/:id",
  "POST /api/ai/feedback",
  "POST /api/ai/prioritize",
  "POST /api/ai/research",
  "POST /api/ai/research/proactive",
  "POST /api/ai/research/suggestions/:id/start",
  "POST /api/ai/summarize",
  "POST /api/items/:id/extract",
  "POST /api/notifications",
  "POST /api/settings/email-intelligence",
  "PUT /api/ai/preferences",
  "PUT /api/notifications/preferences",
] as const;

function session(createdAt = new Date()): VerifiedProviderSession["session"] {
  return {
    data: {
      user: { id: "provider-subject", email: "amit@example.com", emailVerified: true },
      session: { id: sessionId, createdAt },
    },
    error: null,
  };
}

function provider(verified: VerifiedProviderSession["session"] = session()) {
  return {
    verifySession: jest.fn(
      async (): Promise<VerifiedProviderSession> => ({
        session: verified,
        headers: new Headers({ "set-cookie": refreshedCookie }),
      })
    ),
  } satisfies NeonProxyProvider;
}

function repositories(account?: LinkedAccount): AuthRepositoryPort {
  return {
    createInvitation: jest.fn(),
    findInvitationById: jest.fn(),
    revokeInvitation: jest.fn(),
    claimInvitationDispatch: jest.fn(),
    completeInvitationDispatch: jest.fn(),
    failInvitationDispatch: jest.fn(),
    consumeInvitationAndLinkIdentity: jest.fn(),
    findAccountByEmail: jest.fn(),
    findAccountByIdentity: jest.fn().mockResolvedValue(account),
  };
}

function dependencies(authProvider: NeonProxyProvider, authRepositories: AuthRepositoryPort) {
  return {
    provider: authProvider,
    repositories: jest.fn(async () => authRepositories),
    allowedOrigins,
    identityTokenSecret,
  };
}

async function identity(headers: Headers | undefined, traceId = requestId) {
  const verified = await verifyIdentityToken(headers?.get(IDENTITY_HEADER), {
    secret: identityTokenSecret,
    traceId,
  });
  if (!verified.ok) throw new Error(`identity token rejected: ${verified.reason}`);
  return verified.claims;
}

describe("composed Neon proxy authorization", () => {
  it("keeps only provider/invitation and specialized capture endpoints public", () => {
    expect(isPublicNeonPath("/api/auth/magic-link/verify")).toBe(true);
    expect(isPublicNeonPath("/api/auth/invitations/request-link")).toBe(true);
    expect(isPublicNeonPath("/api/v1/captures")).toBe(true);
    expect(isPublicNeonPath("/api/auth/devices")).toBe(false);
    expect(isPublicNeonPath("/api/auth/gmail")).toBe(false);
    expect(isPublicNeonPath("/api/auth/invitations/issue")).toBe(true);
    expect(isPublicNeonPath("/api/v1/feed")).toBe(false);
    expect(isPublicNeonPath("/invite")).toBe(true);
    expect(isPublicNeonPath("/sign-in")).toBe(true);
    expect(isPublicNeonPath("/reset-password")).toBe(true);
    expect(isPublicNeonPath("/api/health")).toBe(true);
    expect(isPublicNeonPath("/api/v1/captures/123")).toBe(true);
    expect(isPublicNeonPath("/api/auth/devices/123")).toBe(false);
    expect(isPublicNeonPath("/api/auth/slack/status")).toBe(false);
  });

  it("denies a valid provider identity with no active internal mapping", async () => {
    const result = await authorizeNeonProxy(
      new NextRequest("https://distil.example/api/v1/feed"),
      requestId,
      dependencies(provider(), repositories())
    );
    expect(result.response?.status).toBe(403);
    await expect(result.response?.json()).resolves.toMatchObject({
      error: { code: "ACCESS_DENIED", message: "Unable to continue" },
    });
    expect(result.requestHeaders).toBeUndefined();
  });

  it("issues a trace-bound identity token from the active user's internal mapping", async () => {
    const result = await authorizeNeonProxy(
      new NextRequest("https://distil.example/api/v1/feed", {
        headers: { [IDENTITY_HEADER]: "attacker-controlled" },
      }),
      requestId,
      dependencies(provider(), repositories({ userId, status: "active" }))
    );
    expect(result.response).toBeUndefined();
    await expect(identity(result.requestHeaders)).resolves.toMatchObject({
      sub: userId,
      kind: "user",
      sid: sessionId,
      fresh: true,
      jti: requestId,
    });
    // Bound to this request: the same token is refused under another trace id.
    await expect(
      identity(result.requestHeaders, "30000000-0000-4000-8000-000000000099")
    ).rejects.toThrow("trace_mismatch");
    // No plain-text identity headers remain as a side channel.
    expect(result.requestHeaders?.get("x-distil-user-id")).toBeNull();
    expect(result.requestHeaders?.get("x-distil-actor-id")).toBeNull();
    expect(result.requestHeaders?.get("x-distil-fresh-auth")).toBeNull();
  });

  it("makes exactly one provider call and never touches the application request URL", async () => {
    const request = new NextRequest("https://distil.example/api/v1/feed?cursor=owned");
    const authProvider = provider();
    await authorizeNeonProxy(
      request,
      requestId,
      dependencies(authProvider, repositories({ userId, status: "active" }))
    );

    expect(authProvider.verifySession).toHaveBeenCalledTimes(1);
    expect(authProvider.verifySession).toHaveBeenCalledWith(request);
    expect(request.nextUrl.searchParams.get("disableCookieCache")).toBeNull();
    expect(request.nextUrl.searchParams.get("cursor")).toBe("owned");
    // The provider exposes no second lookup the resolver could fall back to.
    expect("getSession" in authProvider).toBe(false);
  });

  it("forwards the provider's refreshed cookies to the browser", async () => {
    const result = await authorizeNeonProxy(
      new NextRequest("https://distil.example/api/v1/feed"),
      requestId,
      dependencies(provider(), repositories({ userId, status: "active" }))
    );
    expect(result.providerHeaders?.get("set-cookie")).toBe(refreshedCookie);

    // Denials keep the provider's cookie updates as well.
    const denied = await authorizeNeonProxy(
      new NextRequest("https://distil.example/api/v1/feed"),
      requestId,
      dependencies(provider(), repositories())
    );
    expect(denied.response?.headers.get("set-cookie")).toBe(refreshedCookie);
  });

  it("redirects an unauthenticated page to sign-in without leaking request parameters", async () => {
    const result = await authorizeNeonProxy(
      new NextRequest("https://distil.example/feed?cursor=owned"),
      requestId,
      dependencies(provider({ data: null, error: null }), repositories())
    );
    expect(result.response?.status).toBe(307);
    expect(result.response?.headers.get("location")).toBe("https://distil.example/sign-in");
  });

  it("returns public requests without invoking the provider or loading repositories", async () => {
    const publicProvider = provider();
    const request = new NextRequest("https://distil.example/api/health", {
      headers: { "x-request-header": "preserved" },
    });
    const publicDependencies = dependencies(publicProvider, repositories());
    const result = await authorizeNeonProxy(request, requestId, publicDependencies);
    expect(result.requestHeaders?.get("x-request-header")).toBe("preserved");
    expect(result.requestHeaders?.get(IDENTITY_HEADER)).toBeNull();
    expect(publicProvider.verifySession).not.toHaveBeenCalled();
    expect(publicDependencies.repositories).not.toHaveBeenCalled();
  });

  it("denies an unauthenticated session before loading or querying repositories", async () => {
    const unauthenticated = provider({ data: null, error: null });
    const authRepositories = repositories();
    const pageDependencies = dependencies(unauthenticated, authRepositories);
    const result = await authorizeNeonProxy(
      new NextRequest("https://distil.example/feed"),
      requestId,
      pageDependencies
    );
    expect(result.response?.status).toBe(307);
    expect(pageDependencies.repositories).not.toHaveBeenCalled();
    expect(authRepositories.findAccountByIdentity).not.toHaveBeenCalled();
  });

  it("uses 401 only for unauthenticated APIs and redirects denied pages", async () => {
    const apiResult = await authorizeNeonProxy(
      new NextRequest("https://distil.example/api/v1/feed"),
      requestId,
      dependencies(provider({ data: null, error: null }), repositories())
    );
    expect(apiResult.response?.status).toBe(401);
    await expect(apiResult.response?.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });

    const providerError = await authorizeNeonProxy(
      new NextRequest("https://distil.example/api/v1/feed"),
      requestId,
      dependencies(provider({ data: null, error: { status: 502 } }), repositories())
    );
    expect(providerError.response?.status).toBe(401);

    const pageResult = await authorizeNeonProxy(
      new NextRequest("https://distil.example/feed"),
      requestId,
      dependencies(provider(), repositories())
    );
    expect(pageResult.response?.status).toBe(307);
    expect(pageResult.response?.headers.get("location")).toBe(
      "https://distil.example/access-denied"
    );
  });

  it("marks old provider sessions as not fresh", async () => {
    const result = await authorizeNeonProxy(
      new NextRequest("https://distil.example/feed"),
      requestId,
      dependencies(provider(session(new Date(0))), repositories({ userId, status: "active" }))
    );
    await expect(identity(result.requestHeaders)).resolves.toMatchObject({ fresh: false });
  });

  it("classifies safe methods and the legacy bearer capture path explicitly", () => {
    expect(requiresNeonSessionOrigin("GET")).toBe(false);
    expect(requiresNeonSessionOrigin("HEAD")).toBe(false);
    expect(requiresNeonSessionOrigin("OPTIONS")).toBe(false);
    expect(requiresNeonSessionOrigin("POST")).toBe(true);
    expect(requiresNeonSessionOrigin("PUT")).toBe(true);
    expect(requiresNeonSessionOrigin("PATCH")).toBe(true);
    expect(requiresNeonSessionOrigin("DELETE")).toBe(true);
    expect(hasSpecializedNeonAuth("/api/items", "POST")).toBe(true);
    expect(hasSpecializedNeonAuth("/api/items", "GET")).toBe(false);
    expect(isLifecycleRecoveryRequest("/account", "GET")).toBe(true);
    expect(isLifecycleRecoveryRequest("/api/v1/account/deletion", "GET")).toBe(true);
    expect(isLifecycleRecoveryRequest("/api/v1/account/deletion", "DELETE")).toBe(true);
    expect(isLifecycleRecoveryRequest("/api/v1/account/deletion", "POST")).toBe(false);
    expect(isLifecycleRecoveryRequest("/api/v1/account", "GET")).toBe(false);
  });

  it("permits deletion-pending identities only on the Account recovery shell and status/cancel API", async () => {
    const pending = { userId, status: "deletion_pending" as const };
    for (const [method, path] of [
      ["GET", "/account"],
      ["GET", "/api/v1/account/deletion"],
      ["DELETE", "/api/v1/account/deletion"],
    ] as const) {
      const result = await authorizeNeonProxy(
        new NextRequest(`https://distil.example${path}`, {
          method,
          ...(method === "DELETE" ? { headers: { origin: "https://distil.example" } } : {}),
        }),
        requestId,
        dependencies(provider(), repositories(pending))
      );
      expect(result.response).toBeUndefined();
      await expect(identity(result.requestHeaders)).resolves.toMatchObject({ sub: userId });
    }

    const general = await authorizeNeonProxy(
      new NextRequest("https://distil.example/api/v1/account"),
      requestId,
      dependencies(provider(), repositories(pending))
    );
    expect(general.response?.status).toBe(403);

    const missingOrigin = await authorizeNeonProxy(
      new NextRequest("https://distil.example/api/v1/account/deletion", { method: "DELETE" }),
      requestId,
      dependencies(provider(), repositories(pending))
    );
    expect(missingOrigin.response?.status).toBe(403);
  });

  it.each(centrallyProtectedMutations)(
    "%s rejects missing/foreign origins and accepts the configured origin",
    async (surface) => {
      const [method, path] = surface.split(" ", 2);
      for (const origin of [undefined, "https://hostile.example"] as const) {
        const authProvider = provider();
        const authRepositories = repositories({ userId, status: "active" });
        const request = new NextRequest(`https://distil.example${path}`, {
          method,
          ...(origin ? { headers: { origin } } : {}),
        });
        const result = await authorizeNeonProxy(
          request,
          requestId,
          dependencies(authProvider, authRepositories)
        );
        expect(result.response?.status).toBe(403);
        await expect(result.response?.json()).resolves.toEqual({
          error: { code: "ACCESS_DENIED", message: "Unable to continue" },
        });
        expect(authRepositories.findAccountByIdentity).not.toHaveBeenCalled();
        // Origin is checked before the provider round trip is spent.
        expect(authProvider.verifySession).not.toHaveBeenCalled();
      }

      const allowed = await authorizeNeonProxy(
        new NextRequest(`https://distil.example${path}`, {
          method,
          headers: { origin: "https://distil.example" },
        }),
        requestId,
        dependencies(provider(), repositories({ userId, status: "active" }))
      );
      expect(allowed.response).toBeUndefined();
      await expect(identity(allowed.requestHeaders)).resolves.toMatchObject({ sub: userId });
    }
  );

  it.each([
    ["GET", "/api/v1/feed", true],
    ["GET", "/api/cron/digests", true],
    ["POST", "/api/v1/captures", false],
    ["POST", "/api/items", false],
    ["POST", "/api/queue/capture-requests", false],
    ["POST", "/api/auth/invitations/request-link", false],
  ] as const)(
    "keeps %s %s on its safe or specialized authentication path",
    async (method, path, invokesProvider) => {
      const authProvider = provider();
      const result = await authorizeNeonProxy(
        new NextRequest(`https://distil.example${path}`, {
          method,
          headers: { authorization: "Bearer dst_cap_test", [IDENTITY_HEADER]: "forged" },
        }),
        requestId,
        dependencies(authProvider, repositories({ userId, status: "active" }))
      );
      expect(result.response).toBeUndefined();
      expect(authProvider.verifySession).toHaveBeenCalledTimes(invokesProvider ? 1 : 0);
      if (invokesProvider) {
        await expect(identity(result.requestHeaders)).resolves.toMatchObject({ sub: userId });
      } else {
        // Specialized and public paths pass the (already sanitized) headers
        // through untouched; the proxy strips inbound identity headers first.
        expect(result.requestHeaders?.get(IDENTITY_HEADER)).toBe("forged");
      }
    }
  );

  it("preserves the dormant connector route with an allowed origin and blocks a hostile one", async () => {
    const connectorDependencies = dependencies(
      provider(),
      repositories({ userId, status: "active" })
    );
    const allowed = await authorizeNeonProxy(
      new NextRequest("https://distil.example/api/auth/gmail", {
        method: "DELETE",
        headers: { origin: "https://distil.example" },
      }),
      requestId,
      connectorDependencies
    );
    expect(allowed.response).toBeUndefined();

    const blocked = await authorizeNeonProxy(
      new NextRequest("https://distil.example/api/auth/gmail", {
        method: "DELETE",
        headers: { origin: "https://hostile.example" },
      }),
      requestId,
      connectorDependencies
    );
    expect(blocked.response?.status).toBe(403);
  });
});
