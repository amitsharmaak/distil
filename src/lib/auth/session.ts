import { createHmac, timingSafeEqual } from "node:crypto";
import { SESSION_DURATION_SECONDS } from "@/lib/auth/constants";

// jose v6 is ESM-only and cannot execute under the repository's CommonJS Jest
// harness. This small implementation emits and verifies the same HS256 compact
// JWS/JWT format so production and tests exercise one constant-time code path.

function signingKey(secret: string): Buffer {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("DISTIL_SESSION_SECRET must contain at least 32 bytes");
  }
  return Buffer.from(secret, "utf8");
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signature(value: string, key: Buffer): Buffer {
  return createHmac("sha256", key).update(value, "ascii").digest();
}

export async function createSessionToken(
  secret: string,
  now = new Date(),
  sessionId = crypto.randomUUID()
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const protectedHeader = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    kind: "session",
    sub: "single-user",
    jti: sessionId,
    iat: issuedAt,
    exp: issuedAt + SESSION_DURATION_SECONDS,
  });
  const signingInput = `${protectedHeader}.${payload}`;
  return `${signingInput}.${signature(signingInput, signingKey(secret)).toString("base64url")}`;
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
    const header = JSON.parse(Buffer.from(protectedHeader, "base64url").toString("utf8")) as {
      alg?: unknown;
      typ?: unknown;
    };
    if (header.alg !== "HS256" || header.typ !== "JWT") return false;

    const expected = signature(`${protectedHeader}.${encodedPayload}`, signingKey(secret));
    const actual = Buffer.from(encodedSignature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
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
