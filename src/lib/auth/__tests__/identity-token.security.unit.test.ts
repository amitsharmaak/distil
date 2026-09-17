import {
  createIdentityToken,
  IDENTITY_TOKEN_TTL_SECONDS,
  verifyIdentityToken,
} from "@/lib/auth/identity-token";
import { encodeJsonBase64Url } from "@/lib/auth/hmac";
import { createSessionToken } from "@/lib/auth/session";

const secret = "identity-token-secret-that-is-at-least-thirty-two-bytes";
const otherSecret = "another-secret-value-that-is-at-least-thirty-two-bytes";
const userId = "20000000-0000-4000-8000-000000000002";
const traceId = "30000000-0000-4000-8000-000000000003";
const sessionId = "40000000-0000-4000-8000-000000000004";
const now = new Date("2026-09-17T12:00:00.000Z");

function claims(overrides: Partial<Parameters<typeof createIdentityToken>[0]> = {}) {
  return {
    userId,
    actorKind: "user" as const,
    sessionId,
    fresh: true,
    traceId,
    ...overrides,
  };
}

describe("proxy identity token", () => {
  it("accepts a token signed for this trace id and returns the exact claims", async () => {
    const token = await createIdentityToken(claims(), secret, now);
    expect(token.split(".")).toHaveLength(3);
    await expect(verifyIdentityToken(token, { secret, traceId, now })).resolves.toEqual({
      ok: true,
      claims: {
        sub: userId,
        kind: "user",
        sid: sessionId,
        fresh: true,
        jti: traceId,
        iat: Math.floor(now.getTime() / 1000),
        exp: Math.floor(now.getTime() / 1000) + IDENTITY_TOKEN_TTL_SECONDS,
      },
    });
  });

  it("omits the session id when the provider session is not a UUID", async () => {
    const token = await createIdentityToken(claims({ sessionId: undefined }), secret, now);
    const verified = await verifyIdentityToken(token, { secret, traceId, now });
    expect(verified).toMatchObject({ ok: true });
    expect(verified.ok && "sid" in verified.claims).toBe(false);
  });

  it("rejects a tampered payload and a tampered signature", async () => {
    const token = await createIdentityToken(claims(), secret, now);
    const [header, , signature] = token.split(".");
    const forgedPayload = encodeJsonBase64Url({
      iss: "distil-proxy",
      sub: "20000000-0000-4000-8000-0000000000ff",
      kind: "user",
      fresh: true,
      jti: traceId,
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(now.getTime() / 1000) + IDENTITY_TOKEN_TTL_SECONDS,
    });
    await expect(
      verifyIdentityToken(`${header}.${forgedPayload}.${signature}`, { secret, traceId, now })
    ).resolves.toEqual({ ok: false, reason: "signature" });

    const flipped = signature.endsWith("A")
      ? `${signature.slice(0, -1)}B`
      : `${signature.slice(0, -1)}A`;
    await expect(
      verifyIdentityToken(token.replace(signature, flipped), { secret, traceId, now })
    ).resolves.toEqual({ ok: false, reason: "signature" });
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createIdentityToken(claims(), otherSecret, now);
    await expect(verifyIdentityToken(token, { secret, traceId, now })).resolves.toEqual({
      ok: false,
      reason: "signature",
    });
  });

  it("expires after exactly two minutes", async () => {
    const token = await createIdentityToken(claims(), secret, now);
    const lastValid = new Date(now.getTime() + (IDENTITY_TOKEN_TTL_SECONDS - 1) * 1000);
    const expired = new Date(now.getTime() + IDENTITY_TOKEN_TTL_SECONDS * 1000);
    await expect(
      verifyIdentityToken(token, { secret, traceId, now: lastValid })
    ).resolves.toMatchObject({ ok: true });
    await expect(verifyIdentityToken(token, { secret, traceId, now: expired })).resolves.toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects a token issued in the future beyond the skew allowance", async () => {
    const token = await createIdentityToken(claims(), secret, new Date(now.getTime() + 60_000));
    await expect(verifyIdentityToken(token, { secret, traceId, now })).resolves.toEqual({
      ok: false,
      reason: "not_yet_valid",
    });
  });

  it("rejects a jti that does not match the request's trace id, or no trace id at all", async () => {
    const token = await createIdentityToken(claims(), secret, now);
    await expect(
      verifyIdentityToken(token, { secret, traceId: "30000000-0000-4000-8000-000000000099", now })
    ).resolves.toEqual({ ok: false, reason: "trace_mismatch" });
    await expect(verifyIdentityToken(token, { secret, traceId: null, now })).resolves.toEqual({
      ok: false,
      reason: "trace_mismatch",
    });
  });

  it("reports a missing or malformed token without throwing", async () => {
    await expect(verifyIdentityToken(undefined, { secret, traceId, now })).resolves.toEqual({
      ok: false,
      reason: "missing",
    });
    await expect(verifyIdentityToken("", { secret, traceId, now })).resolves.toEqual({
      ok: false,
      reason: "missing",
    });
    await expect(verifyIdentityToken("a.b", { secret, traceId, now })).resolves.toEqual({
      ok: false,
      reason: "malformed",
    });
    await expect(verifyIdentityToken("!!.!!.!!", { secret, traceId, now })).resolves.toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects claims outside the contract even when correctly signed", async () => {
    const bogusKind = await createIdentityToken(
      claims({ actorKind: "administrator" as never }),
      secret,
      now
    );
    await expect(verifyIdentityToken(bogusKind, { secret, traceId, now })).resolves.toEqual({
      ok: false,
      reason: "claims",
    });
    const bogusUser = await createIdentityToken(claims({ userId: "not-a-uuid" }), secret, now);
    await expect(verifyIdentityToken(bogusUser, { secret, traceId, now })).resolves.toEqual({
      ok: false,
      reason: "claims",
    });
  });

  it("never accepts the legacy session token, even when both share the same secret", async () => {
    const legacy = await createSessionToken(secret, now, traceId);
    await expect(verifyIdentityToken(legacy, { secret, traceId, now })).resolves.toEqual({
      ok: false,
      reason: "signature",
    });
  });

  it("refuses to sign or verify with a short secret", async () => {
    await expect(createIdentityToken(claims(), "short", now)).rejects.toThrow("at least 32 bytes");
    const token = await createIdentityToken(claims(), secret, now);
    await expect(verifyIdentityToken(token, { secret: "short", traceId, now })).rejects.toThrow(
      "at least 32 bytes"
    );
  });
});
