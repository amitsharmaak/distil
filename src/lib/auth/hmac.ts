/**
 * HMAC-SHA256 signing primitives shared by the legacy session token and the
 * proxy-to-route identity token. Web Crypto only, so the same code runs in
 * the proxy and in route handlers.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

export function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Uint8Array.from(atob(`${normalized}${padding}`), (character) => character.charCodeAt(0));
}

export function encodeJsonBase64Url(value: unknown): string {
  return encodeBase64Url(encoder.encode(JSON.stringify(value)));
}

export function decodeJsonBase64Url(value: string): unknown {
  return JSON.parse(decoder.decode(decodeBase64Url(value)));
}

export async function hmacSha256(value: string, keyBytes: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

/** Constant-time comparison; length differences short-circuit by design. */
export function signaturesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}
