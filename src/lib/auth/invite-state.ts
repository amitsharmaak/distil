import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const PENDING_INVITATION_COOKIE = "__Host-distil_pending_invite";
export const PENDING_INVITATION_TTL_SECONDS = 15 * 60;

export interface PendingInvitationState {
  token: string;
  nextPath: string;
  expiresAt: number;
}

function encryptionKey(secret: string): Uint8Array {
  if (secret.length < 32) throw new Error("Invite state secret must be at least 32 characters");
  return createHash("sha256").update(secret, "utf8").digest();
}

export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.includes("\\") || value.startsWith("/api/") || value.startsWith("/login")) return "/";
  return value.slice(0, 2048);
}

export async function sealPendingInvitation(
  input: { token: string; nextPath?: unknown },
  secret: string,
  now = new Date()
): Promise<string> {
  const state: PendingInvitationState = {
    token: input.token,
    nextPath: safeNextPath(input.nextPath),
    expiresAt: Math.floor(now.getTime() / 1000) + PENDING_INVITATION_TTL_SECONDS,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from("distil-invite-state-v1", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(state), "utf8"), cipher.final()]);
  return [iv, ciphertext, cipher.getAuthTag()].map((part) => part.toString("base64url")).join(".");
}

export async function openPendingInvitation(
  value: string | undefined,
  secret: string,
  now = new Date()
): Promise<PendingInvitationState | undefined> {
  if (!value) return undefined;
  try {
    const parts = value.split(".");
    if (parts.length !== 3) return undefined;
    const [iv, ciphertext, tag] = parts.map((part) => Buffer.from(part, "base64url"));
    if (iv.length !== 12 || tag.length !== 16) return undefined;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
    decipher.setAAD(Buffer.from("distil-invite-state-v1", "utf8"));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      "utf8"
    );
    const parsed = JSON.parse(plaintext) as Partial<PendingInvitationState>;
    if (
      typeof parsed.token !== "string" ||
      typeof parsed.nextPath !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt < Math.floor(now.getTime() / 1000)
    ) {
      return undefined;
    }
    return {
      token: parsed.token,
      nextPath: safeNextPath(parsed.nextPath),
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return undefined;
  }
}

export const pendingInvitationCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: PENDING_INVITATION_TTL_SECONDS,
};
