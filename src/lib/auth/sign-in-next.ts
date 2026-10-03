import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { safeNextPath } from "@/lib/auth/invite-state";

/**
 * Carries "where to go after a returning user signs in" across the magic-link round trip, for
 * example back to `/extension/connect?state=...`. Password sign-in navigates client-side and does
 * not need this. The value is AES-256-GCM sealed like the invitation state, expires quickly, and is
 * always re-validated through `safeNextPath`, so it can only ever name a same-origin page path.
 */
export const PENDING_SIGN_IN_NEXT_COOKIE = "__Host-distil_pending_sign_in_next";

/** Where a completed reauthentication returns when the exchange minted a fresh session. */
export const REAUTHENTICATED_RETURN_PATH = "/account?reauthenticated=1";
/**
 * Where it returns when the callback was followed but the session the browser now holds is not
 * fresh (the provider kept the old session instead of minting a new one). The Account page turns
 * this into a plain "sign out and sign in again" notice; the server still enforces freshness.
 */
export const REAUTHENTICATION_STALE_RETURN_PATH = "/account?reauthenticated=stale";
export const PENDING_SIGN_IN_NEXT_TTL_SECONDS = 15 * 60;

const AAD = Buffer.from("distil-sign-in-next-v1", "utf8");

function encryptionKey(secret: string): Uint8Array {
  if (secret.length < 32) throw new Error("Sign-in state secret must be at least 32 characters");
  return createHash("sha256").update(secret, "utf8").digest();
}

/**
 * Seals the return path. `boundSubject` (reauthentication) ties the path to the provider subject
 * that asked for it: the completion handler only follows it when the newly minted session belongs
 * to that same subject, so a link opened in a browser that meanwhile signed in as someone else
 * degrades to an ordinary sign-in at the home page.
 */
export function sealSignInNext(
  nextPath: unknown,
  secret: string,
  now = new Date(),
  boundSubject?: string
): string {
  const state = {
    nextPath: safeNextPath(nextPath),
    expiresAt: Math.floor(now.getTime() / 1000) + PENDING_SIGN_IN_NEXT_TTL_SECONDS,
    ...(boundSubject ? { boundSubject } : {}),
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(state), "utf8"), cipher.final()]);
  return [iv, ciphertext, cipher.getAuthTag()].map((part) => part.toString("base64url")).join(".");
}

/**
 * Returns the validated same-origin path, or `undefined` when missing, forged, expired, or bound
 * to a provider subject other than `subject`.
 */
export function openSignInNext(
  value: string | undefined,
  secret: string,
  now = new Date(),
  subject?: string
): string | undefined {
  if (!value) return undefined;
  try {
    const parts = value.split(".");
    if (parts.length !== 3) return undefined;
    const [iv, ciphertext, tag] = parts.map((part) => Buffer.from(part, "base64url"));
    if (iv.length !== 12 || tag.length !== 16) return undefined;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const parsed = JSON.parse(
      Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
    ) as { nextPath?: unknown; expiresAt?: unknown; boundSubject?: unknown };
    if (
      typeof parsed.nextPath !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt < Math.floor(now.getTime() / 1000)
    ) {
      return undefined;
    }
    if (parsed.boundSubject !== undefined && parsed.boundSubject !== subject) return undefined;
    return safeNextPath(parsed.nextPath);
  } catch {
    return undefined;
  }
}

export const pendingSignInNextCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: PENDING_SIGN_IN_NEXT_TTL_SECONDS,
};
