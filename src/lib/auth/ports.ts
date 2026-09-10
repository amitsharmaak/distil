import type { LinkedAccount, ProviderIdentity } from "@/lib/auth/account";
import type { UserId } from "@/lib/contracts";

export interface InvitationRecord {
  id: string;
  normalizedEmail: string;
  emailHash: string;
  tokenSalt: string;
  tokenHash: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  issuedByActorId: string;
  issuanceReason: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  revokedByActorId?: string;
  revokeReason?: string;
  consumedAt?: string;
  consumedByUserId?: UserId;
}

export interface ConsumeInvitationInput {
  invitationId: string;
  tokenHash: string;
  emailHash: string;
  provider: ProviderIdentity["provider"];
  providerSubject: string;
  providerSessionId: string;
  consumedAt: string;
}

export interface InvitationDispatchClaimInput {
  invitationId: string;
  tokenHash: string;
  emailHash: string;
  claimId: string;
}

export interface InvitationRepositoryPort {
  createInvitation(record: InvitationRecord): Promise<void>;
  findInvitationById(id: string): Promise<InvitationRecord | undefined>;
  revokeInvitation(input: {
    invitationId: string;
    revokedAt: string;
    revokedByActorId: string;
    reason: string;
  }): Promise<boolean>;
  /** Atomically revalidates the pending invite and acquires its provider-dispatch lease. */
  claimInvitationDispatch(input: InvitationDispatchClaimInput): Promise<boolean>;
  /** Commits a successful provider call and starts the per-invitation resend cooldown. */
  completeInvitationDispatch(input: { invitationId: string; claimId: string }): Promise<boolean>;
  /** Releases a failed provider call into a bounded database-calculated retry delay. */
  failInvitationDispatch(input: { invitationId: string; claimId: string }): Promise<boolean>;
  /**
   * Atomically rechecks hash, email, expiry/revocation/consumption state, then
   * creates/reactivates the user and inserts auth_identities(provider,
   * provider_subject, user_id). A replay returns undefined.
   */
  consumeInvitationAndLinkIdentity(
    input: ConsumeInvitationInput
  ): Promise<LinkedAccount | undefined>;
}

export interface AuthIdentityRepositoryPort {
  findAccountByEmail(email: string): Promise<LinkedAccount | undefined>;
  findAccountByIdentity(input: {
    provider: ProviderIdentity["provider"];
    providerSubject: string;
  }): Promise<LinkedAccount | undefined>;
}

export interface AuthRepositoryPort extends InvitationRepositoryPort, AuthIdentityRepositoryPort {}

export interface ProviderSession {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ProviderSessionPort {
  listSessions(): Promise<ProviderSession[]>;
  revokeSession(token: string): Promise<boolean>;
  revokeAllSessions(): Promise<boolean>;
  revokeOtherSessions(): Promise<boolean>;
}
