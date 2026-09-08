import { NextRequest, NextResponse } from "next/server";
import {
  authorizeNeonProxy,
  hasSpecializedNeonAuth,
  isLifecycleRecoveryRequest,
  isPublicNeonPath,
  requiresNeonSessionOrigin,
} from "@/lib/auth/neon-proxy";
import type { LinkedAccount } from "@/lib/auth/account";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import { userIdSchema } from "@/lib/contracts";

const userId = userIdSchema.parse("20000000-0000-4000-8000-000000000002");
const requestId = "30000000-0000-4000-8000-000000000003";
const allowedOrigins = new Set(["https://distil.example"]);
const centrallyProtectedMutations = [
  "DELETE /api/ai/research/suggestions/:id",
  "DELETE /api/items/:id",
  "PATCH /api/items/:id",
  "PATCH /api/notifications/:id",
  "POST /api/agent/approvals",
  "POST /api/agent/chat",
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

function provider() {
  return {
    middleware: jest.fn(() => async () => NextResponse.next()),
    getSession: jest.fn().mockResolvedValue({
      data: {
        user: { id: "provider-subject", email: "amit@example.com", emailVerified: true },
        session: { id: "provider-session", createdAt: new Date() },
      },
      error: null,
    }),
  };
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
    findAccountByIdentity: jest.fn().mockResolvedValue(account),
  };
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
    expect(isPublicNeonPath("/api/health")).toBe(true);
    expect(isPublicNeonPath("/api/v1/captures/123")).toBe(true);
    expect(isPublicNeonPath("/api/auth/devices/123")).toBe(false);
    expect(isPublicNeonPath("/api/auth/slack/status")).toBe(false);
  });

  it("denies a valid provider identity with no active internal mapping", async () => {
    const result = await authorizeNeonProxy(
      new NextRequest("https://distil.example/api/v1/feed"),
      requestId,
      { provider: provider(), repositories: repositories(), allowedOrigins }
    );
    expect(result.response?.status).toBe(403);
    await expect(result.response?.json()).resolves.toMatchObject({
      error: { code: "ACCESS_DENIED", message: "Unable to continue" },
    });
  });

  it("overwrites forged tenant headers from an active user's internal mapping", async () => {
    const result = await authorizeNeonProxy(
      new NextRequest("https://distil.example/api/v1/feed", {
        headers: { "x-distil-user-id": "attacker-controlled" },
      }),
      requestId,
      {
        provider: provider(),
        repositories: repositories({ userId, status: "active" }),
        allowedOrigins,
      }
    );
    expect(result.response).toBeUndefined();
    expect(result.requestHeaders?.get("x-distil-user-id")).toBe(userId);
    expect(result.requestHeaders?.get("x-distil-actor-id")).toBe(userId);
    expect(result.requestHeaders?.get("x-distil-actor-kind")).toBe("user");
    expect(result.requestHeaders?.get("x-distil-fresh-auth")).toBe("1");
    expect(result.providerHeaders?.get("x-middleware-next")).toBe("1");
  });

  it("returns public requests without invoking provider middleware", async () => {
    const publicProvider = provider();
    const request = new NextRequest("https://distil.example/api/health", {
      headers: { "x-request-header": "preserved" },
    });
    const result = await authorizeNeonProxy(request, requestId, {
      provider: publicProvider,
      repositories: repositories(),
      allowedOrigins,
    });
    expect(result.requestHeaders?.get("x-request-header")).toBe("preserved");
    expect(publicProvider.middleware).not.toHaveBeenCalled();
  });

  it("returns the provider redirect before resolving an internal account", async () => {
    const redirect = NextResponse.redirect(new URL("/invite", "https://distil.example"));
    const redirectingProvider = provider();
    redirectingProvider.middleware.mockReturnValue(async () => redirect);
    const authRepositories = repositories();
    const result = await authorizeNeonProxy(
      new NextRequest("https://distil.example/feed"),
      requestId,
      { provider: redirectingProvider, repositories: authRepositories, allowedOrigins }
    );
    expect(result.response).toBe(redirect);
    expect(authRepositories.findAccountByIdentity).not.toHaveBeenCalled();
  });

  it("uses 401 only for unauthenticated APIs and redirects denied pages", async () => {
    const unauthenticated = provider();
    unauthenticated.getSession.mockResolvedValue({ data: null, error: null });
    const apiResult = await authorizeNeonProxy(
      new NextRequest("https://distil.example/api/v1/feed"),
      requestId,
      { provider: unauthenticated, repositories: repositories(), allowedOrigins }
    );
    expect(apiResult.response?.status).toBe(401);
    await expect(apiResult.response?.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });

    const pageResult = await authorizeNeonProxy(
      new NextRequest("https://distil.example/feed"),
      requestId,
      { provider: provider(), repositories: repositories(), allowedOrigins }
    );
    expect(pageResult.response?.status).toBe(307);
    expect(pageResult.response?.headers.get("location")).toBe(
      "https://distil.example/access-denied"
    );
  });

  it("marks old provider sessions as not fresh", async () => {
    const staleProvider = provider();
    staleProvider.getSession.mockResolvedValue({
      data: {
        user: { id: "provider-subject", email: "amit@example.com", emailVerified: true },
        session: { id: "provider-session", createdAt: new Date(0) },
      },
      error: null,
    });
    const result = await authorizeNeonProxy(
      new NextRequest("https://distil.example/feed"),
      requestId,
      {
        provider: staleProvider,
        repositories: repositories({ userId, status: "active" }),
        allowedOrigins,
      }
    );
    expect(result.requestHeaders?.get("x-distil-fresh-auth")).toBe("0");
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
        { provider: provider(), repositories: repositories(pending), allowedOrigins }
      );
      expect(result.response).toBeUndefined();
      expect(result.requestHeaders?.get("x-distil-user-id")).toBe(userId);
    }

    const general = await authorizeNeonProxy(
      new NextRequest("https://distil.example/api/v1/account"),
      requestId,
      { provider: provider(), repositories: repositories(pending), allowedOrigins }
    );
    expect(general.response?.status).toBe(403);

    const missingOrigin = await authorizeNeonProxy(
      new NextRequest("https://distil.example/api/v1/account/deletion", { method: "DELETE" }),
      requestId,
      { provider: provider(), repositories: repositories(pending), allowedOrigins }
    );
    expect(missingOrigin.response?.status).toBe(403);
  });

  it.each(centrallyProtectedMutations)(
    "%s rejects missing/foreign origins and accepts the configured origin",
    async (surface) => {
      const [method, path] = surface.split(" ", 2);
      for (const origin of [undefined, "https://hostile.example"] as const) {
        const authRepositories = repositories({ userId, status: "active" });
        const request = new NextRequest(`https://distil.example${path}`, {
          method,
          ...(origin ? { headers: { origin } } : {}),
        });
        const result = await authorizeNeonProxy(request, requestId, {
          provider: provider(),
          repositories: authRepositories,
          allowedOrigins,
        });
        expect(result.response?.status).toBe(403);
        await expect(result.response?.json()).resolves.toEqual({
          error: { code: "ACCESS_DENIED", message: "Unable to continue" },
        });
        expect(authRepositories.findAccountByIdentity).not.toHaveBeenCalled();
      }

      const allowed = await authorizeNeonProxy(
        new NextRequest(`https://distil.example${path}`, {
          method,
          headers: { origin: "https://distil.example" },
        }),
        requestId,
        {
          provider: provider(),
          repositories: repositories({ userId, status: "active" }),
          allowedOrigins,
        }
      );
      expect(allowed.response).toBeUndefined();
      expect(allowed.requestHeaders?.get("x-distil-user-id")).toBe(userId);
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
          headers: { authorization: "Bearer dst_cap_test" },
        }),
        requestId,
        {
          provider: authProvider,
          repositories: repositories({ userId, status: "active" }),
          allowedOrigins,
        }
      );
      expect(result.response).toBeUndefined();
      expect(authProvider.middleware).toHaveBeenCalledTimes(invokesProvider ? 1 : 0);
    }
  );

  it("preserves the dormant connector route with an allowed origin and blocks a hostile one", async () => {
    const dependencies = {
      provider: provider(),
      repositories: repositories({ userId, status: "active" }),
      allowedOrigins,
    };
    const allowed = await authorizeNeonProxy(
      new NextRequest("https://distil.example/api/auth/gmail", {
        method: "DELETE",
        headers: { origin: "https://distil.example" },
      }),
      requestId,
      dependencies
    );
    expect(allowed.response).toBeUndefined();

    const blocked = await authorizeNeonProxy(
      new NextRequest("https://distil.example/api/auth/gmail", {
        method: "DELETE",
        headers: { origin: "https://hostile.example" },
      }),
      requestId,
      dependencies
    );
    expect(blocked.response?.status).toBe(403);
  });
});
