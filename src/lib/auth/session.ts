import { SESSION_DURATION_SECONDS } from "@/lib/auth/constants";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function signingKey(secret: string): Uint8Array {
  const key = encoder.encode(secret);
  if (key.byteLength < 32) {
    throw new Error("DISTIL_SESSION_SECRET must contain at least 32 bytes");
  }
  return key;
}

function encode(value: unknown): string {
  return encodeBytes(encoder.encode(JSON.stringify(value)));
}

function encodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function decodeBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Uint8Array.from(atob(`${normalized}${padding}`), (character) => character.charCodeAt(0));
}

async function signature(value: string, keyBytes: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function signaturesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
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
  const signed = await signature(signingInput, signingKey(secret));
  return `${signingInput}.${encodeBytes(signed)}`;
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
    const header = JSON.parse(decoder.decode(decodeBytes(protectedHeader))) as {
      alg?: unknown;
      typ?: unknown;
    };
    if (header.alg !== "HS256" || header.typ !== "JWT") return false;

    const expected = await signature(`${protectedHeader}.${encodedPayload}`, signingKey(secret));
    const actual = decodeBytes(encodedSignature);
    if (!signaturesEqual(actual, expected)) return false;

    const payload = JSON.parse(decoder.decode(decodeBytes(encodedPayload))) as {
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
