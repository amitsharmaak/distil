import { AccessDeniedError, type LinkedAccount } from "@/lib/auth/account";
import {
  freshAuthMarker,
  readProviderIdentity,
  requireFreshAuthentication,
  resolveLegacyAuthRequest,
  resolveNeonAuthRequest,
} from "@/lib/auth/request-context";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import { createSessionToken } from "@/lib/auth/session";
import { userIdSchema } from "@/lib/contracts";

const userId = userIdSchema.parse("20000000-0000-4000-8000-000000000002");
const requestId = "30000000-0000-4000-8000-000000000003";
const now = new Date("2026-09-07T12:00:00.000Z");

function provider(emailVerified = true, createdAt = now) {
  return {
    getSession: jest.fn().mockResolvedValue({
      data: {
        user: { id: "external-neon-subject", email: "amit@example.com", emailVerified },
        session: { id: "not-assumed-to-be-a-uuid", createdAt },
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
    consumeInvitationAndLinkIdentity: jest.fn(),
    findAccountByIdentity: jest.fn().mockResolvedValue(account),
  };
}

describe("request AuthContext resolution", () => {
  it("accepts authentication exactly through the freshness boundary and rejects stale markers", () => {
    const boundary = freshAuthMarker(now, new Date(now.getTime() + 10 * 60 * 1000));
    expect(boundary.isFresh).toBe(true);
    expect(() => requireFreshAuthentication(boundary)).not.toThrow();
    expect(() =>
      requireFreshAuthentication(freshAuthMarker(now, new Date(now.getTime() + 10 * 60 * 1000 + 1)))
    ).toThrow(AccessDeniedError);
  });

  it.each([
    { data: null, error: new Error("provider down") },
    { data: null, error: null },
    { data: { user: null, session: { id: "session", createdAt: now } }, error: null },
    {
      data: { user: { id: "subject", email: "amit@example.com", emailVerified: true } },
      error: null,
    },
  ])("rejects incomplete provider session results", async (result) => {
    await expect(
      readProviderIdentity({ getSession: jest.fn().mockResolvedValue(result) } as never)
    ).rejects.toEqual(expect.objectContaining({ reason: "unauthenticated" }));
  });

  it("uses only the internal active user id and preserves the locked AuthContext shape", async () => {
    const result = await resolveNeonAuthRequest(
      provider(),
      repositories({ userId, primaryEmail: "amit@example.com", status: "active" }),
      requestId,
      now
    );
    expect(result.context).toEqual({
      userId,
      actorKind: "user",
      actorId: userId,
      requestId,
    });
    expect(result.context).not.toHaveProperty("workspaceId");
    expect(result.context).not.toHaveProperty("providerSubject");
    expect(result.freshAuth.isFresh).toBe(true);
  });

  it.each([undefined, "migration_pending", "suspended", "deletion_pending", "deleted"] as const)(
    "denies an unmapped or inactive account (%s)",
    async (status) => {
      const linked = status ? { userId, primaryEmail: "amit@example.com", status } : undefined;
      await expect(
        resolveNeonAuthRequest(provider(), repositories(linked), requestId, now)
      ).rejects.toBeInstanceOf(AccessDeniedError);
    }
  );

  it("requires provider-verified email and marks older sessions as not fresh", async () => {
    await expect(
      resolveNeonAuthRequest(provider(false), repositories(), requestId, now)
    ).rejects.toEqual(expect.objectContaining({ reason: "unverified" }));
    const old = new Date(now.getTime() - 11 * 60 * 1000);
    const result = await resolveNeonAuthRequest(
      provider(true, old),
      repositories({ userId, status: "active" }),
      requestId,
      now
    );
    expect(result.freshAuth.isFresh).toBe(false);
  });

  it("preserves valid session ids and replaces invalid request ids", async () => {
    const sessionId = "40000000-0000-4000-8000-000000000004";
    const result = await resolveNeonAuthRequest(
      provider(true, now),
      repositories({ userId, primaryEmail: "amit@example.com", status: "active" }),
      "not-a-request-id",
      now
    );
    const uuidProvider = provider(true, now);
    uuidProvider.getSession.mockResolvedValue({
      data: {
        user: { id: "external-neon-subject", email: "amit@example.com", emailVerified: true },
        session: { id: sessionId, createdAt: now },
      },
      error: null,
    });
    const withSession = await resolveNeonAuthRequest(
      uuidProvider,
      repositories({ userId, status: "active" }),
      undefined,
      now
    );
    expect(result.context.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(withSession.context.sessionId).toBe(sessionId);
    expect(withSession.context.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("resolves a valid legacy session and rejects a missing one", async () => {
    const secret = "legacy-session-secret-that-is-at-least-thirty-two-bytes";
    const token = await createSessionToken(secret, now);
    const request = new Request("https://distil.example", {
      headers: { cookie: `distil_session=${token}` },
    });
    await expect(
      resolveLegacyAuthRequest(
        request,
        { sessionSecret: secret, legacyUserId: userId, requestId },
        now
      )
    ).resolves.toEqual({
      userId,
      actorKind: "user",
      actorId: userId,
      requestId,
    });
    await expect(
      resolveLegacyAuthRequest(
        new Request("https://distil.example"),
        { sessionSecret: secret, legacyUserId: userId },
        now
      )
    ).rejects.toEqual(expect.objectContaining({ reason: "unauthenticated" }));
  });

  it("generates a request id for a legacy session with an invalid trace id", async () => {
    const secret = "legacy-session-secret-that-is-at-least-thirty-two-bytes";
    const token = await createSessionToken(secret, now);
    const context = await resolveLegacyAuthRequest(
      new Request("https://distil.example", {
        headers: { cookie: `distil_session=${token}` },
      }),
      { sessionSecret: secret, legacyUserId: userId, requestId: "not-a-uuid" },
      now
    );
    expect(context.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
