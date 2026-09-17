import { SESSION_DURATION_SECONDS } from "@/lib/auth/constants";
import {
  decodeBase64Url,
  decodeJsonBase64Url,
  encodeBase64Url,
  encodeJsonBase64Url,
  hmacSha256,
  signaturesEqual,
} from "@/lib/auth/hmac";

const encoder = new TextEncoder();

function signingKey(secret: string): Uint8Array {
  const key = encoder.encode(secret);
  if (key.byteLength < 32) {
    throw new Error("DISTIL_SESSION_SECRET must contain at least 32 bytes");
  }
  return key;
}

export async function createSessionToken(
  secret: string,
  now = new Date(),
  sessionId = crypto.randomUUID()
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const protectedHeader = encodeJsonBase64Url({ alg: "HS256", typ: "JWT" });
  const payload = encodeJsonBase64Url({
    kind: "session",
    sub: "single-user",
    jti: sessionId,
    iat: issuedAt,
    exp: issuedAt + SESSION_DURATION_SECONDS,
  });
  const signingInput = `${protectedHeader}.${payload}`;
  const signed = await hmacSha256(signingInput, signingKey(secret));
  return `${signingInput}.${encodeBase64Url(signed)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
  now = new Date()
): Promise<boolean> {
  if (!token) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [protectedHeader, encodedPayload, encodedSignature] = parts;
    const header = decodeJsonBase64Url(protectedHeader) as {
      alg?: unknown;
      typ?: unknown;
    };
    if (header.alg !== "HS256" || header.typ !== "JWT") return false;

    const expected = await hmacSha256(`${protectedHeader}.${encodedPayload}`, signingKey(secret));
    const actual = decodeBase64Url(encodedSignature);
    if (!signaturesEqual(actual, expected)) return false;

    const payload = decodeJsonBase64Url(encodedPayload) as {
      kind?: unknown;
      sub?: unknown;
      jti?: unknown;
      iat?: unknown;
      exp?: unknown;
    };
    const currentTime = Math.floor(now.getTime() / 1000);
    return (
      payload.kind === "session" &&
      payload.sub === "single-user" &&
      typeof payload.jti === "string" &&
      typeof payload.iat === "number" &&
      typeof payload.exp === "number" &&
      payload.iat <= currentTime + 60 &&
      payload.exp - payload.iat === SESSION_DURATION_SECONDS &&
      payload.exp > currentTime
    );
  } catch {
    return false;
  }
}

export function sessionCookieOptions(maxAge = SESSION_DURATION_SECONDS) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
