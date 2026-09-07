import { NextRequest, NextResponse } from "next/server";
import { authorizeNeonProxy, isPublicNeonPath } from "@/lib/auth/neon-proxy";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import { userIdSchema } from "@/lib/contracts";

const userId = userIdSchema.parse("20000000-0000-4000-8000-000000000002");
const requestId = "30000000-0000-4000-8000-000000000003";

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

function repositories(account?: {
  userId: typeof userId;
  status: "active" | "suspended";
}): AuthRepositoryPort {
  return {
    createInvitation: jest.fn(),
    findInvitationById: jest.fn(),
    revokeInvitation: jest.fn(),
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
      { provider: provider(), repositories: repositories() }
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
      { provider: provider(), repositories: repositories({ userId, status: "active" }) }
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
      { provider: redirectingProvider, repositories: authRepositories }
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
      { provider: unauthenticated, repositories: repositories() }
    );
    expect(apiResult.response?.status).toBe(401);
    await expect(apiResult.response?.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });

    const pageResult = await authorizeNeonProxy(
      new NextRequest("https://distil.example/feed"),
      requestId,
      { provider: provider(), repositories: repositories() }
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
      { provider: staleProvider, repositories: repositories({ userId, status: "active" }) }
    );
    expect(result.requestHeaders?.get("x-distil-fresh-auth")).toBe("0");
  });
});
