import { AccessDeniedError, type LinkedAccount } from "@/lib/auth/account";
import { resolveNeonAuthRequest } from "@/lib/auth/request-context";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
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

  it.each([undefined, "migration_pending", "suspended", "deleting", "deleted"] as const)(
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
});
