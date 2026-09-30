import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { CAPTURE_TOKEN_PREFIX } from "@/lib/auth/constants";
import type { AuthContext } from "@/lib/contracts/tenant-context";
import type { CaptureTokenRepository } from "@/lib/repositories/ports";

export interface IssuedCaptureToken {
  id: string;
  name: string;
  token: string;
  tokenPrefix: string;
  createdAt: string;
}

export function hashCaptureToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

/** Display name stored for the account's single capture token. */
export const CAPTURE_TOKEN_NAME = "Capture token";

/**
 * Issues the account's one capture token, revoking any token issued before it
 * (including legacy per-client tokens). The plaintext is returned exactly once.
 */
export async function issueCaptureToken(
  context: AuthContext,
  repository: CaptureTokenRepository,
  options: { now?: Date; id?: string; random?: Uint8Array } = {}
): Promise<IssuedCaptureToken> {
  const token = `${CAPTURE_TOKEN_PREFIX}${Buffer.from(options.random ?? randomBytes(32)).toString("base64url")}`;
  const createdAt = (options.now ?? new Date()).toISOString();
  const record = {
    userId: context.userId,
    id: options.id ?? randomUUID(),
    name: CAPTURE_TOKEN_NAME,
    tokenHash: hashCaptureToken(token),
    tokenPrefix: token.slice(0, CAPTURE_TOKEN_PREFIX.length + 8),
    createdAt,
  };
  await repository.replaceActive(record);
  return { id: record.id, name: record.name, token, tokenPrefix: record.tokenPrefix, createdAt };
}

export function safeTokenEqual(left: string, right: string): boolean {
  const leftHash = Buffer.from(hashCaptureToken(left));
  const rightHash = Buffer.from(hashCaptureToken(right));
  return timingSafeEqual(leftHash, rightHash);
}
