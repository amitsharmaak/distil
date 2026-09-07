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
    expect(isPublicNeonPath("/api/auth/invitations/issue")).toBe(false);
    expect(isPublicNeonPath("/api/v1/feed")).toBe(false);
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
  });
});
