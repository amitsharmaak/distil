import type { Priority } from "@/lib/types";
import type { AuthContext, UserId } from "@/lib/contracts/tenant-context";
import type { CaptureQueueMessageV2 } from "@/lib/contracts/tenant-jobs";

export const CAPTURE_SOURCES = ["web", "ios-shortcut", "browser-extension"] as const;

export type CaptureSource = (typeof CAPTURE_SOURCES)[number];

export const CAPTURE_STATUSES = ["queued", "processing", "ready", "rejected", "failed"] as const;

export type CaptureStatus = (typeof CAPTURE_STATUSES)[number];

export interface CaptureDispatcher {
  dispatch(message: CaptureQueueMessageV2, options: { idempotencyKey: string }): Promise<void>;
}

export type AuthPrincipal =
  | { kind: "session"; context: AuthContext }
  | {
      kind: "capture-token";
      context: AuthContext;
      userId: UserId;
      tokenId: string;
    };

export interface CreateCaptureRequest {
  url: string;
  title?: string;
  notes?: string;
  topics?: string[];
  priority?: Priority;
  source: CaptureSource;
}

export interface CaptureError {
  code: string;
  message: string;
}

export interface CaptureReceipt {
  id: string;
  normalizedUrl: string;
  status: CaptureStatus;
  itemId?: string;
  retryable: boolean;
  attempts: number;
  error?: CaptureError;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCaptureResponse {
  receipt: CaptureReceipt;
  duplicate: boolean;
}

export const API_ERROR_CODES = [
  "INVALID_REQUEST",
  "UNAUTHORIZED",
  "ORIGIN_NOT_ALLOWED",
  "RATE_LIMITED",
  "UNSAFE_URL",
  "QUEUE_UNAVAILABLE",
  "CAPTURE_NOT_FOUND",
  "CAPTURE_NOT_RETRYABLE",
  "PROCESSING_FAILED",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
