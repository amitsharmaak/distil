import { createCipheriv, createHash, randomBytes } from "node:crypto";
import {
  openPendingInvitation,
  safeNextPath,
  sealPendingInvitation,
} from "@/lib/auth/invite-state";

const secret = "state-secret-that-is-at-least-thirty-two-characters";
const now = new Date("2026-09-07T12:00:00.000Z");

function sealRaw(value: unknown): string {
  const iv = randomBytes(12);
  const key = createHash("sha256").update(secret, "utf8").digest();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("distil-invite-state-v1", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, ciphertext, cipher.getAuthTag()].map((part) => part.toString("base64url")).join(".");
}

describe("sealed invitation state", () => {
  it.each([
    [undefined, "/"],
    ["https://hostile.example/steal", "/"],
    ["//hostile.example/steal", "/"],
    ["/safe\\hostile", "/"],
    ["/api/private", "/"],
    ["/login/again", "/"],
    ["/feed?view=recent", "/feed?view=recent"],
  ])("normalizes an untrusted next path", (value, expected) => {
    expect(safeNextPath(value)).toBe(expected);
  });

  it("bounds long safe paths before sealing", async () => {
    const value = `/feed?value=${"a".repeat(3000)}`;
    expect(safeNextPath(value)).toHaveLength(2048);
    const sealed = await sealPendingInvitation({ token: "token", nextPath: value }, secret, now);
    await expect(openPendingInvitation(sealed, secret, now)).resolves.toMatchObject({
      token: "token",
      nextPath: safeNextPath(value),
    });
  });

  it("rejects short secrets before encrypting state", async () => {
    await expect(sealPendingInvitation({ token: "token" }, "too-short", now)).rejects.toThrow(
      "Invite state secret must be at least 32 characters"
    );
  });

  it.each([undefined, "one.two", "AA.AA.AA", "not.cipher.text"])(
    "rejects missing, malformed, or tampered state without throwing",
    async (value) => {
      await expect(openPendingInvitation(value, secret, now)).resolves.toBeUndefined();
    }
  );

  it.each([
    {},
    { token: 1, nextPath: "/feed", expiresAt: 2_000_000_000 },
    { token: "token", nextPath: 1, expiresAt: 2_000_000_000 },
    { token: "token", nextPath: "/feed", expiresAt: "never" },
    { token: "token", nextPath: "/feed", expiresAt: 1 },
  ])("rejects a decrypted state with an invalid contract", async (state) => {
    await expect(openPendingInvitation(sealRaw(state), secret, now)).resolves.toBeUndefined();
  });
});
