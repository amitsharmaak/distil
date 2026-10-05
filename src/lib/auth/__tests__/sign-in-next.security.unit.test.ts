import {
  openSignInNext,
  PENDING_SIGN_IN_NEXT_TTL_SECONDS,
  sealSignInNext,
} from "@/lib/auth/sign-in-next";

const secret = "a-sign-in-next-secret-with-at-least-32-characters";
const now = new Date("2026-09-30T12:00:00Z");
const connectPath = "/extension/connect?state=abcdefghijklmnopqrstuvwxyz0123456789ABCDEF";

describe("sealed sign-in return path", () => {
  it("round-trips a same-origin path, including its query string", () => {
    const sealed = sealSignInNext(connectPath, secret, now);
    expect(sealed).not.toContain("extension");
    expect(openSignInNext(sealed, secret, now)).toBe(connectPath);
  });

  it("collapses external, protocol-relative, backslash and API paths to the home page", () => {
    for (const hostile of [
      "https://evil.example/x",
      "//evil.example/x",
      "/\\evil.example",
      "/api/v1/captures",
      "/login",
      undefined,
      42,
    ]) {
      expect(openSignInNext(sealSignInNext(hostile, secret, now), secret, now)).toBe("/");
    }
  });

  it("rejects a forged, tampered, wrong-secret or expired value", () => {
    const sealed = sealSignInNext(connectPath, secret, now);
    const [iv, ciphertext, tag] = sealed.split(".");
    const flipped = `${ciphertext.slice(0, -2)}${ciphertext.endsWith("AA") ? "BB" : "AA"}`;
    expect(openSignInNext([iv, flipped, tag].join("."), secret, now)).toBeUndefined();
    expect(openSignInNext(sealed, `${secret}-other`, now)).toBeUndefined();
    expect(openSignInNext("not.a.cookie", secret, now)).toBeUndefined();
    expect(openSignInNext(undefined, secret, now)).toBeUndefined();
    const later = new Date(now.getTime() + (PENDING_SIGN_IN_NEXT_TTL_SECONDS + 1) * 1000);
    expect(openSignInNext(sealed, secret, later)).toBeUndefined();
  });

  it("opens a subject-bound path only for that subject; unbound paths ignore the subject", () => {
    const bound = sealSignInNext("/account?reauthenticated=1", secret, now, "subject-a");
    expect(bound).not.toContain("subject-a");
    expect(openSignInNext(bound, secret, now, "subject-a")).toBe("/account?reauthenticated=1");
    expect(openSignInNext(bound, secret, now, "subject-b")).toBeUndefined();
    expect(openSignInNext(bound, secret, now)).toBeUndefined();
    const unbound = sealSignInNext(connectPath, secret, now);
    expect(openSignInNext(unbound, secret, now, "subject-b")).toBe(connectPath);
  });

  it("refuses a short secret instead of sealing weakly", () => {
    expect(() => sealSignInNext(connectPath, "short", now)).toThrow();
  });
});
