import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { CAPTURE_TOKEN_PREFIX } from "@/lib/auth/constants";
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

export async function issueCaptureToken(
  repository: CaptureTokenRepository,
  name: string,
  options: { now?: Date; id?: string; random?: Uint8Array } = {}
): Promise<IssuedCaptureToken> {
  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length > 80)
    throw new Error("Token name must be 1-80 characters");

  const token = `${CAPTURE_TOKEN_PREFIX}${Buffer.from(options.random ?? randomBytes(32)).toString("base64url")}`;
  const createdAt = (options.now ?? new Date()).toISOString();
  const record = {
    id: options.id ?? randomUUID(),
    name: trimmedName,
    tokenHash: hashCaptureToken(token),
    tokenPrefix: token.slice(0, CAPTURE_TOKEN_PREFIX.length + 8),
    createdAt,
  };
  await repository.create(record);
  return { id: record.id, name: record.name, token, tokenPrefix: record.tokenPrefix, createdAt };
}

export function safeTokenEqual(left: string, right: string): boolean {
  const leftHash = Buffer.from(hashCaptureToken(left));
  const rightHash = Buffer.from(hashCaptureToken(right));
  return timingSafeEqual(leftHash, rightHash);
}
