import type { AuthContext, UserId } from "@/lib/contracts";

export const ACCOUNT_STATUSES = [
  "migration_pending",
  "active",
  "suspended",
  "deletion_pending",
  "deleted",
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export interface LinkedAccount {
  userId: UserId;
  primaryEmail?: string;
  status: AccountStatus;
}

export interface ProviderIdentity {
  provider: "neon";
  subject: string;
  email: string;
  emailVerified: boolean;
  sessionId: string;
  authenticatedAt: Date;
}

export interface FreshAuthMarker {
  authenticatedAt: string;
  freshUntil: string;
  isFresh: boolean;
}

export interface ResolvedAuthRequest {
  context: AuthContext;
  account: LinkedAccount;
  identity: ProviderIdentity;
  freshAuth: FreshAuthMarker;
}

export class AccessDeniedError extends Error {
  constructor(readonly reason: "unauthenticated" | "unmapped" | "disabled" | "unverified") {
    super("Unable to continue");
    this.name = "AccessDeniedError";
  }
}
