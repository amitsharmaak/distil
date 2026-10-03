import { NEON_AUTH_SESSION_CHALLENGE_COOKIE } from "@/lib/auth/magic-link";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import {
  createReauthenticationHandler,
  REAUTHENTICATED_RETURN_PATH,
  type ReauthenticationProvider,
} from "@/lib/auth/reauthentication";
import { openSignInNext, PENDING_SIGN_IN_NEXT_COOKIE } from "@/lib/auth/sign-in-next";

const origin = "https://distil.example";
const stateSecret = "reauthentication-state-secret-with-32-characters";
const findAccountByIdentity = jest.fn();
const getSession = jest.fn();
const requestMagicLink = jest.fn();

function handler() {
  return createReauthenticationHandler({
    provider: { getSession, requestMagicLink } as ReauthenticationProvider,
    repositories: { findAccountByIdentity } as unknown as AuthRepositoryPort,
    appOrigin: origin,
    stateSecret,
  });
}

function cookieValue(response: Response, name: string): string | undefined {
  const header = response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));
  return header?.slice(name.length + 1).split(";")[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  getSession.mockResolvedValue({
    data: {
      user: { id: "provider-owner", email: "owner@example.test", emailVerified: true },
      session: { id: "22222222-2222-4222-8222-222222222222", createdAt: new Date(0) },
    },
    error: null,
  });
  findAccountByIdentity.mockResolvedValue({
    userId: "11111111-1111-4111-8111-111111111111",
    status: "active",
  });
  requestMagicLink.mockResolvedValue({
    error: null,
    setCookieHeaders: ["provider_marker=abc; Path=/; Secure; HttpOnly"],
  });
});

describe("fresh authentication ceremony", () => {
  it("sends a new magic link only to the mapped session identity, completing through the exchanging route", async () => {
    const response = await handler()(
      new Request(`${origin}/api/auth/reauthenticate`, {
        method: "POST",
        headers: { origin },
      })
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(requestMagicLink).toHaveBeenCalledWith({
      email: "owner@example.test",
      // A page callback cannot exchange the one-time verifier; only the completion route
      // (which runs the SDK middleware) mints the new session that reopens the fresh window.
      callbackURL: "https://distil.example/api/auth/sign-in/complete",
      newUserCallbackURL: "https://distil.example/access-denied",
      errorCallbackURL: "https://distil.example/access-denied",
    });
  });

  it("issues the session-challenge marker and forwards provider cookies so the callback can exchange", async () => {
    const response = await handler()(
      new Request(`${origin}/api/auth/reauthenticate`, {
        method: "POST",
        headers: { origin },
      })
    );
    const setCookies = response.headers.getSetCookie();
    const challenge = setCookies.find((cookie) =>
      cookie.startsWith(`${NEON_AUTH_SESSION_CHALLENGE_COOKIE}=`)
    );
    expect(challenge).toMatch(/HttpOnly/i);
    expect(challenge).toMatch(/Secure/i);
    expect(challenge).toMatch(/SameSite=lax/i);
    expect(setCookies).toContain("provider_marker=abc; Path=/; Secure; HttpOnly");
  });

  it("seals the Account return path bound to the requesting provider subject", async () => {
    const response = await handler()(
      new Request(`${origin}/api/auth/reauthenticate`, {
        method: "POST",
        headers: { origin },
      })
    );
    const sealed = cookieValue(response, PENDING_SIGN_IN_NEXT_COOKIE);
    expect(sealed).toBeDefined();
    expect(sealed).not.toContain("account");
    expect(openSignInNext(sealed, stateSecret, new Date(), "provider-owner")).toBe(
      REAUTHENTICATED_RETURN_PATH
    );
    // Another identity completing this link gets no "verified" landing.
    expect(openSignInNext(sealed, stateSecret, new Date(), "provider-other")).toBeUndefined();
    expect(openSignInNext(sealed, stateSecret, new Date())).toBeUndefined();
  });

  it.each([
    ["a hostile origin", { origin: "https://hostile.example" }],
    ["an absent session", { origin, session: null }],
    ["an unmapped identity", { origin, account: null }],
  ])("fails closed for %s", async (_case, input) => {
    if ("session" in input) getSession.mockResolvedValue({ data: input.session, error: null });
    if ("account" in input) findAccountByIdentity.mockResolvedValue(input.account);
    const response = await handler()(
      new Request(`${origin}/api/auth/reauthenticate`, {
        method: "POST",
        headers: { origin: input.origin },
      })
    );
    expect(response.status).toBe(503);
    expect(requestMagicLink).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("does not disclose provider errors or the account email, and sets no cookies on failure", async () => {
    requestMagicLink.mockResolvedValue({ error: new Error("smtp owner@example.test secret") });
    const response = await handler()(
      new Request(`${origin}/api/auth/reauthenticate`, {
        method: "POST",
        headers: { origin },
      })
    );
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("owner@example.test");
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});
