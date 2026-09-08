import type { UserId } from "@/lib/contracts";

export type AccountExportStatus = "pending" | "running" | "ready" | "failed" | "expired";

export interface AccountExportRecord {
  id: string;
  userId: UserId;
  status: AccountExportStatus;
  idempotencyKey: string;
  manifestVersion: number;
  objectRef?: string;
  contentHash?: string;
  sizeBytes?: number;
  failureCode?: string;
  requestedAt: string;
  updatedAt: string;
  completedAt?: string;
  downloadExpiresAt: string;
  purgeAfter: string;
}

export type AccountDeletionStatus =
  | "requested"
  | "draining"
  | "purging"
  | "completed"
  | "cancelled"
  | "failed";

export interface AccountDeletionRecord {
  id: string;
  userId: UserId;
  status: AccountDeletionStatus;
  checkpoint: Record<string, unknown>;
  requestedAt: string;
  purgeAfter: string;
  updatedAt: string;
  startedAt?: string;
  cancelledAt?: string;
  completedAt?: string;
  failureCode?: string;
}

export interface ExportDataset {
  name: string;
  rows: ReadonlyArray<Record<string, unknown>>;
}

export interface UsageCounter {
  date: string;
  operation: string;
  provider: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  costMicrousd: number;
}

export interface UserQuota {
  quotaKey: string;
  period: "day" | "month";
  hardLimit: number;
}

export interface TenantLifecycleRepository {
  createExport(input: {
    id: string;
    idempotencyKey: string;
    requestedAt: string;
    downloadExpiresAt: string;
    purgeAfter: string;
  }): Promise<{ record: AccountExportRecord; created: boolean }>;
  listExports(input: { limit: number }): Promise<AccountExportRecord[]>;
  findExport(id: string): Promise<AccountExportRecord | undefined>;
  claimExport(id: string, at: string): Promise<AccountExportRecord | undefined>;
  completeExport(input: {
    id: string;
    objectRef: string;
    contentHash: string;
    sizeBytes: number;
    completedAt: string;
  }): Promise<AccountExportRecord | undefined>;
  failExport(id: string, failureCode: string, at: string): Promise<void>;
  expireExport(id: string, at: string): Promise<AccountExportRecord | undefined>;
  readExportDatasets(): Promise<ExportDataset[]>;
  requestDeletion(input: {
    id: string;
    requestedAt: string;
    purgeAfter: string;
  }): Promise<{ record: AccountDeletionRecord; created: boolean }>;
  findDeletion(): Promise<AccountDeletionRecord | undefined>;
  cancelDeletion(input: {
    deletionId: string;
    actorId: string;
    reason: string;
    cancelledAt: string;
  }): Promise<AccountDeletionRecord | undefined>;
  getUsage(input: { from: string; through: string }): Promise<UsageCounter[]>;
  listQuotas(): Promise<UserQuota[]>;
  consumeUsage(input: {
    date: string;
    operation: string;
    provider?: string;
    requestCount?: number;
    inputTokens?: number;
    outputTokens?: number;
    costMicrousd?: number;
  }): Promise<{ allowed: boolean; counter: UsageCounter; quota?: UserQuota }>;
}

export interface PurgeVerification {
  deletionId: string;
  zeroRowCount: number;
  zeroObjectCount: number;
  authPurged: boolean;
  verificationHash: string;
}

export interface ControlPlaneLifecycleRepository {
  findDeletionVerification(deletionId: string): Promise<PurgeVerification | undefined>;
  findDeletionWork(deletionId: string, userId: UserId): Promise<AccountDeletionRecord | undefined>;
  markDeletionPurging(deletionId: string, userId: UserId, at: string): Promise<boolean>;
  completeDeletion(input: {
    deletionId: string;
    userId: UserId;
    completedAt: string;
    zeroObjectCount: number;
    authPurged: boolean;
    actorId: string;
    requestId: string;
  }): Promise<PurgeVerification>;
  failDeletion(deletionId: string, userId: UserId, failureCode: string, at: string): Promise<void>;
  suspendAccount(input: {
    userId: UserId;
    actorId: string;
    requestId: string;
    reason: string;
    at: string;
  }): Promise<boolean>;
  audit(input: {
    id: string;
    actorId: string;
    action: string;
    targetUserId: UserId;
    reason: string;
    requestId: string;
    outcome: "succeeded" | "failed" | "no-op";
    metadata?: Record<string, string | number | boolean>;
    at: string;
  }): Promise<void>;
}

/** Provider admin deletion/revocation is external and deliberately adapter-neutral. */
export interface AuthAccountPurger {
  revokeSessions(userId: UserId): Promise<void>;
  deleteIdentity(userId: UserId): Promise<void>;
}
