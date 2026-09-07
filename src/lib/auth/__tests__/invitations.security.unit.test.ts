import {
  acceptInvitation,
  executeInvitationCommand,
  INVITATION_TTL_MS,
  issueInvitation,
  normalizeEmail,
  validateInvitation,
} from "@/lib/auth/invitations";
import { AccessDeniedError, type LinkedAccount, type ProviderIdentity } from "@/lib/auth/account";
import type {
  AuthRepositoryPort,
  ConsumeInvitationInput,
  InvitationRecord,
} from "@/lib/auth/ports";
import { userIdSchema } from "@/lib/contracts";

const now = new Date("2026-09-07T12:00:00.000Z");
const actorId = "10000000-0000-4000-8000-000000000001";
const account: LinkedAccount = {
  userId: userIdSchema.parse("20000000-0000-4000-8000-000000000002"),
  primaryEmail: "amit@example.com",
  status: "active",
};

function fakeRepositories(): AuthRepositoryPort & {
  invitation?: InvitationRecord;
  consumed?: ConsumeInvitationInput;
} {
  const repository: AuthRepositoryPort & {
    invitation?: InvitationRecord;
    consumed?: ConsumeInvitationInput;
  } = {
    async createInvitation(record) {
      repository.invitation = record;
    },
    async findInvitationById(id) {
      return repository.invitation?.id === id ? repository.invitation : undefined;
    },
    async revokeInvitation(input) {
      if (!repository.invitation || repository.invitation.id !== input.invitationId) return false;
      repository.invitation.status = "revoked";
      repository.invitation.revokedAt = input.revokedAt;
      repository.invitation.revokedByActorId = input.revokedByActorId;
      repository.invitation.revokeReason = input.reason;
      return true;
    },
    async consumeInvitationAndLinkIdentity(input) {
      if (!repository.invitation || repository.invitation.status !== "pending") return undefined;
      if (
        input.tokenHash !== repository.invitation.tokenHash ||
        input.emailHash !== repository.invitation.emailHash
      )
        return undefined;
      repository.consumed = input;
      repository.invitation.status = "accepted";
      repository.invitation.consumedAt = input.consumedAt;
      return account;
    },
    async findAccountByIdentity() {
      return account;
    },
  };
  return repository;
}

async function issued() {
  const repositories = fakeRepositories();
  const result = await issueInvitation(
    {
      action: "issue",
      email: " Amit@Example.COM ",
      issuedByActorId: actorId,
      reason: "Phase 3 pilot",
      appOrigin: "https://distil.example",
    },
    repositories,
    now
  );
  const token = new URLSearchParams(new URL(result.invitationUrl).hash.slice(1)).get("token")!;
  return { repositories, result, token };
}

describe("operator invitations", () => {
  it("stores only salted token/email hashes and expires after exactly seven days", async () => {
    const { repositories, result, token } = await issued();
    expect(repositories.invitation).toMatchObject({
      normalizedEmail: "amit@example.com",
      status: "pending",
      issuedByActorId: actorId,
      issuanceReason: "Phase 3 pilot",
    });
    expect(repositories.invitation?.expiresAt).toBe(
      new Date(now.getTime() + INVITATION_TTL_MS).toISOString()
    );
    expect(JSON.stringify(repositories.invitation)).not.toContain(token.split(".")[1]);
    expect(result.invitationUrl).toContain("/invite#token=");
  });

  it("binds the token to canonical email and rejects expiry/revocation generically", async () => {
    const { repositories, token } = await issued();
    await expect(
      validateInvitation(token, "AMIT@example.com", repositories, now)
    ).resolves.toBeDefined();
    await expect(validateInvitation(token, "other@example.com", repositories, now)).rejects.toEqual(
      expect.objectContaining({ message: "Unable to continue" })
    );
    await expect(
      validateInvitation(
        token,
        "amit@example.com",
        repositories,
        new Date(now.getTime() + INVITATION_TTL_MS)
      )
    ).rejects.toBeInstanceOf(AccessDeniedError);

    await executeInvitationCommand(
      {
        action: "revoke",
        invitationId: repositories.invitation!.id,
        revokedByActorId: actorId,
        reason: "Email entered incorrectly",
      },
      repositories,
      now
    );
    await expect(
      validateInvitation(token, "amit@example.com", repositories, now)
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("links only a matching verified identity and makes consumption single-use", async () => {
    const { repositories, token } = await issued();
    const identity: ProviderIdentity = {
      provider: "neon",
      subject: "provider-subject-not-an-internal-id",
      email: "amit@example.com",
      emailVerified: true,
      sessionId: "provider-session",
      authenticatedAt: now,
    };
    await expect(acceptInvitation(token, identity, repositories, now)).resolves.toEqual(account);
    expect(repositories.consumed).toMatchObject({
      provider: "neon",
      providerSubject: identity.subject,
      providerSessionId: identity.sessionId,
    });
    await expect(acceptInvitation(token, identity, repositories, now)).rejects.toBeInstanceOf(
      AccessDeniedError
    );

    const unverified = { ...identity, emailVerified: false };
    await expect(acceptInvitation(token, unverified, repositories, now)).rejects.toEqual(
      expect.objectContaining({ reason: "unverified" })
    );
  });

  it("normalizes Unicode and surrounding whitespace consistently", () => {
    expect(normalizeEmail("  AMIT@ＥＸＡＭＰＬＥ.COM  ")).toBe("amit@example.com");
  });
});
