import { createHmac } from "node:crypto";
import { createSessionToken, sessionCookieOptions, verifySessionToken } from "@/lib/auth/session";

const secret = "a-secure-session-secret-with-more-than-32-bytes";
const now = new Date("2026-03-01T12:00:00.000Z");

function signedToken(header: object, payload: object): string {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", secret).update(input).digest("base64url");
  return `${input}.${signature}`;
}

describe("signed session cookies", () => {
  it("issues an HS256 single-user session valid for thirty days", async () => {
    const token = await createSessionToken(secret, now, "session-id");
    const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
    expect(header).toEqual({ alg: "HS256", typ: "JWT" });
    await expect(verifySessionToken(token, secret, now)).resolves.toBe(true);
    await expect(verifySessionToken(token, secret, new Date("2026-03-31T12:00:01Z"))).resolves.toBe(
      false
    );
  });

  it("rejects forged and malformed sessions", async () => {
    const token = await createSessionToken(secret, now, "session-id");
    await expect(verifySessionToken(`${token.slice(0, -1)}x`, secret, now)).resolves.toBe(false);
    await expect(verifySessionToken(token, `${secret}-different`, now)).resolves.toBe(false);
    await expect(verifySessionToken("not-a-jwt", secret, now)).resolves.toBe(false);
  });

  it("rejects signed tokens with an unexpected algorithm, subject, or issued-at time", async () => {
    const validClaims = {
      kind: "session",
      sub: "single-user",
      jti: "id",
      iat: 1_772_366_400,
      exp: 1_774_958_400,
    };
    await expect(
      verifySessionToken(signedToken({ alg: "none", typ: "JWT" }, validClaims), secret, now)
    ).resolves.toBe(false);
    await expect(
      verifySessionToken(
        signedToken({ alg: "HS256", typ: "JWT" }, { ...validClaims, sub: "another-user" }),
        secret,
        now
      )
    ).resolves.toBe(false);
    await expect(
      verifySessionToken(
        signedToken(
          { alg: "HS256", typ: "JWT" },
          { ...validClaims, iat: validClaims.iat + 3600, exp: validClaims.exp + 3600 }
        ),
        secret,
        now
      )
    ).resolves.toBe(false);
  });

  it("requires a strong signing secret", async () => {
    await expect(createSessionToken("too-short", now)).rejects.toThrow(/32 bytes/);
    await expect(verifySessionToken("anything", "too-short", now)).resolves.toBe(false);
  });

  it("sets hardened cookie attributes", () => {
    expect(sessionCookieOptions()).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 2_592_000,
    });
  });
});
