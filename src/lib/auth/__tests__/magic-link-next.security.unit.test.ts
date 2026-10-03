import {
  createReturningMagicLinkCompletionHandler,
  createReturningMagicLinkRequestHandler,
} from "@/lib/auth/magic-link";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import { PENDING_SIGN_IN_NEXT_COOKIE, sealSignInNext } from "@/lib/auth/sign-in-next";

const origin = "https://distil.example";
const stateSecret = "state-secret-that-is-at-least-thirty-two-characters";
const connectPath = "/extension/connect?state=abcdefghijklmnopqrstuvwxyz0123456789ABCDEF";

function repositories(
  overrides: Partial<Record<"findAccountByEmail" | "findAccountByIdentity", unknown>> = {}
) {
  return {
    findAccountByEmail: jest.fn().mockResolvedValue({
      userId: "20000000-0000-4000-8000-000000000002",
      primaryEmail: "amit@example.com",
      status: "active",
    }),
    findAccountByIdentity: jest
      .fn()
      .mockResolvedValue({ userId: "20000000-0000-4000-8000-000000000002", status: "active" }),
    ...overrides,
  } as unknown as AuthRepositoryPort;
}

const provider = {
  getSession: jest.fn().mockResolvedValue({
    data: {
      user: { id: "provider-subject", email: "amit@example.com", emailVerified: true },
      session: { id: "provider-session", createdAt: new Date() },
    },
    error: null,
  }),
  requestMagicLink: jest.fn().mockResolvedValue({ error: null, setCookieHeaders: [] }),
};

const requestLink = (body: unknown) =>
  new Request(`${origin}/api/auth/sign-in/request-link`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("returning sign-in return path", () => {
  beforeEach(() => jest.clearAllMocks());

  it("seals `next` into a cookie for known and unknown addresses alike", async () => {
    const known = await createReturningMagicLinkRequestHandler({
      provider,
      repositories: repositories(),
      appOrigin: origin,
      stateSecret,
    })(requestLink({ email: "amit@example.com", next: connectPath }));
    const unknown = await createReturningMagicLinkRequestHandler({
      provider,
      repositories: repositories({ findAccountByEmail: jest.fn().mockResolvedValue(undefined) }),
      appOrigin: origin,
      stateSecret,
    })(requestLink({ email: "nobody@example.com", next: connectPath }));

    for (const response of [known, unknown]) {
      expect(response.status).toBe(202);
      expect(response.headers.getSetCookie().join("\n")).toContain(PENDING_SIGN_IN_NEXT_COOKIE);
    }
    expect(provider.requestMagicLink).toHaveBeenCalledTimes(1);
  });

  it("sets no cookie without a `next`, without a secret, and survives a bad secret", async () => {
    const plain = await createReturningMagicLinkRequestHandler({
      provider,
      repositories: repositories(),
      appOrigin: origin,
      stateSecret,
    })(requestLink({ email: "amit@example.com" }));
    const noSecret = await createReturningMagicLinkRequestHandler({
      provider,
      repositories: repositories(),
      appOrigin: origin,
    })(requestLink({ email: "amit@example.com", next: connectPath }));
    const badSecret = await createReturningMagicLinkRequestHandler({
      provider,
      repositories: repositories(),
      appOrigin: origin,
      stateSecret: "short",
    })(requestLink({ email: "amit@example.com", next: connectPath }));

    expect(plain.headers.getSetCookie().join("\n")).not.toContain(PENDING_SIGN_IN_NEXT_COOKIE);
    expect(noSecret.headers.getSetCookie().join("\n")).not.toContain(PENDING_SIGN_IN_NEXT_COOKIE);
    expect(badSecret.status).toBe(202);
    expect(badSecret.headers.getSetCookie().join("\n")).not.toContain(PENDING_SIGN_IN_NEXT_COOKIE);
  });

  const completion = (cookie: string | undefined, account = repositories()) =>
    createReturningMagicLinkCompletionHandler({
      provider,
      repositories: account,
      appOrigin: origin,
      stateSecret,
    })(
      new Request(`${origin}/api/auth/sign-in/complete`, {
        headers: cookie ? { cookie: `${PENDING_SIGN_IN_NEXT_COOKIE}=${cookie}` } : {},
      })
    );

  it("returns an active account to the sealed page and clears the cookie", async () => {
    const response = await completion(sealSignInNext(connectPath, stateSecret));
    expect(response.headers.get("location")).toBe(`${origin}${connectPath}`);
    expect(response.headers.getSetCookie().join("\n")).toMatch(
      new RegExp(`${PENDING_SIGN_IN_NEXT_COOKIE}=;.*Max-Age=0`, "i")
    );
  });

  it("falls back to the home page for a missing, forged or hostile value", async () => {
    expect((await completion(undefined)).headers.get("location")).toBe(`${origin}/`);
    expect((await completion("forged.value.here")).headers.get("location")).toBe(`${origin}/`);
    const hostile = sealSignInNext("https://evil.example/", stateSecret);
    expect((await completion(hostile)).headers.get("location")).toBe(`${origin}/`);
  });

  it("returns a reauthenticated subject to the Account page with the verified marker", async () => {
    const sealed = sealSignInNext(
      "/account?reauthenticated=1",
      stateSecret,
      new Date(),
      "provider-subject"
    );
    const response = await completion(sealed);
    expect(response.headers.get("location")).toBe(`${origin}/account?reauthenticated=1`);
    expect(response.headers.getSetCookie().join("\n")).toMatch(
      new RegExp(`${PENDING_SIGN_IN_NEXT_COOKIE}=;.*Max-Age=0`, "i")
    );
  });

  it("sends a different identity completing a bound reauthentication link to the home page", async () => {
    const sealed = sealSignInNext(
      "/account?reauthenticated=1",
      stateSecret,
      new Date(),
      "someone-else"
    );
    const response = await completion(sealed);
    // The new session already belongs to the link's identity (the SDK exchange happened before
    // this handler ran); only the "verified" landing is withheld.
    expect(response.headers.get("location")).toBe(`${origin}/`);
    expect(response.headers.getSetCookie().join("\n")).toMatch(
      new RegExp(`${PENDING_SIGN_IN_NEXT_COOKIE}=;.*Max-Age=0`, "i")
    );
  });

  it("never follows the return path for an account that is not active", async () => {
    const inactive = repositories({
      findAccountByIdentity: jest
        .fn()
        .mockResolvedValue({ userId: "20000000-0000-4000-8000-000000000002", status: "suspended" }),
    });
    const response = await completion(sealSignInNext(connectPath, stateSecret), inactive);
    expect(response.headers.get("location")).toBe(`${origin}/access-denied`);
  });
});
