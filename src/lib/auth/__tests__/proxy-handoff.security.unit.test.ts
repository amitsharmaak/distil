/**
 * Proxy-level guarantees of the identity handoff: inbound internal headers are
 * stripped before any branch, the token the proxy forwards verifies against
 * the trace id it also forwards, rate limiting runs before authentication, and
 * the provider's cookie refresh reaches the browser.
 */
import { NextRequest } from "next/server";
import type { LinkedAccount } from "@/lib/auth/account";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import type { VerifiedProviderSession } from "@/lib/auth/neon-proxy";
import { IDENTITY_HEADER, verifyIdentityToken } from "@/lib/auth/identity-token";
import { userIdSchema } from "@/lib/contracts";

const userId = userIdSchema.parse("20000000-0000-4000-8000-000000000002");
const identityTokenSecret = "proxy-handoff-cookie-secret-with-32-bytes-minimum";
const refreshedCookie = "__Secure-neon-auth.local.session_data=refreshed; Path=/; HttpOnly";

const environment = {
  FEATURE_NEON_AUTH: "true",
  NEON_AUTH_BASE_URL: "https://auth.distil.example",
  NEON_AUTH_COOKIE_SECRET: identityTokenSecret,
  DISTIL_ALLOWED_ORIGINS: "https://distil.example",
};

const fakes = {
  session: undefined as VerifiedProviderSession["session"] | undefined,
  provider: {
    verifySession: jest.fn(
      async (): Promise<VerifiedProviderSession> => ({
        session: fakes.session ?? { data: null, error: null },
        headers: new Headers({ "set-cookie": refreshedCookie }),
      })
    ),
  },
  loadRepositories: jest.fn(),
  authRepositories: {} as AuthRepositoryPort,
};

jest.mock("@/lib/auth/neon-server", () => ({
  getNeonProxyProvider: () => fakes.provider,
}));
jest.mock("@/lib/auth/repository-runtime", () => ({
  getAuthRepositoryPort: async () => {
    fakes.loadRepositories();
    return fakes.authRepositories;
  },
}));

function authRepositories(account?: LinkedAccount): AuthRepositoryPort {
  return {
    createInvitation: jest.fn(),
    findInvitationById: jest.fn(),
    revokeInvitation: jest.fn(),
    claimInvitationDispatch: jest.fn(),
    completeInvitationDispatch: jest.fn(),
    failInvitationDispatch: jest.fn(),
    consumeInvitationAndLinkIdentity: jest.fn(),
    findAccountByEmail: jest.fn(),
    findAccountByIdentity: jest.fn(async () => account),
  };
}

function activeSession(): VerifiedProviderSession["session"] {
  return {
    data: {
      user: { id: "provider-subject", email: "amit@example.com", emailVerified: true },
      session: { id: "40000000-0000-4000-8000-000000000004", createdAt: new Date() },
    },
    error: null,
  };
}

const forgedHeaders = {
  [IDENTITY_HEADER]: "forged-token",
  "x-distil-user-id": "attacker-controlled",
  "x-distil-actor-kind": "system",
  "x-distil-proxy-timing": 'evil;dur=0;desc="x"',
  "x-trace-id": "30000000-0000-4000-8000-00000000dead",
  "x-request-header": "preserved",
};

/** Headers Next.js will hand to the route, as exposed on the pass-through response. */
function forwarded(response: Response, name: string): string | null {
  return response.headers.get(`x-middleware-request-${name}`);
}

const originalEnvironment = { ...process.env };

beforeEach(() => {
  Object.assign(process.env, environment);
  fakes.provider.verifySession.mockClear();
  fakes.loadRepositories.mockClear();
  fakes.session = activeSession();
  fakes.authRepositories = authRepositories({ userId, status: "active" });
});

afterAll(() => {
  process.env = originalEnvironment;
});

describe("proxy identity handoff", () => {
  it.each([
    ["GET", "/api/health"],
    ["POST", "/api/items"],
    ["GET", "/sign-in"],
    ["POST", "/api/v1/captures"],
  ])(
    "strips inbound identity and trace headers on the public/specialized path %s %s",
    async (method, path) => {
      const { proxy } = await import("@/proxy");
      const response = await proxy(
        new NextRequest(`https://distil.example${path}`, {
          method,
          headers: { ...forgedHeaders, origin: "https://distil.example" },
        })
      );

      expect(response.status).toBe(200);
      expect(forwarded(response, IDENTITY_HEADER)).toBeNull();
      expect(forwarded(response, "x-distil-user-id")).toBeNull();
      expect(forwarded(response, "x-distil-actor-kind")).toBeNull();
      expect(forwarded(response, "x-request-header")).toBe("preserved");
      const traceId = forwarded(response, "x-trace-id");
      expect(traceId).toMatch(/^[0-9a-f-]{36}$/);
      expect(traceId).not.toBe(forgedHeaders["x-trace-id"]);
      expect(response.headers.get("x-trace-id")).toBe(traceId);
      expect(fakes.provider.verifySession).not.toHaveBeenCalled();
      expect(fakes.loadRepositories).not.toHaveBeenCalled();
    }
  );

  it("replaces forged identity headers with one token bound to the forwarded trace id", async () => {
    const { proxy } = await import("@/proxy");
    const response = await proxy(
      new NextRequest("https://distil.example/api/v1/feed", { headers: forgedHeaders })
    );

    expect(response.status).toBe(200);
    expect(fakes.provider.verifySession).toHaveBeenCalledTimes(1);
    expect(fakes.loadRepositories).toHaveBeenCalledTimes(1);
    expect(forwarded(response, "x-distil-user-id")).toBeNull();
    expect(forwarded(response, "x-distil-actor-kind")).toBeNull();
    const traceId = forwarded(response, "x-trace-id");
    expect(traceId).not.toBe(forgedHeaders["x-trace-id"]);
    const token = forwarded(response, IDENTITY_HEADER);
    expect(token).not.toBe("forged-token");
    await expect(
      verifyIdentityToken(token, { secret: identityTokenSecret, traceId })
    ).resolves.toMatchObject({
      ok: true,
      claims: { sub: userId, kind: "user", jti: traceId, fresh: true },
    });
    // The forged timing value never survives either.
    expect(forwarded(response, "x-distil-proxy-timing")).toMatch(/^proxy-auth-provider;/);
    // The provider's cookie refresh reaches the browser.
    expect(response.headers.get("set-cookie")).toContain(refreshedCookie);
  });

  it("also sanitizes headers on the way to a page render", async () => {
    const { proxy } = await import("@/proxy");
    const response = await proxy(
      new NextRequest("https://distil.example/feed", { headers: forgedHeaders })
    );
    expect(response.status).toBe(200);
    expect(forwarded(response, "x-distil-user-id")).toBeNull();
    expect(forwarded(response, "x-distil-proxy-timing")).toBeNull();
    const traceId = forwarded(response, "x-trace-id");
    await expect(
      verifyIdentityToken(forwarded(response, IDENTITY_HEADER), {
        secret: identityTokenSecret,
        traceId,
      })
    ).resolves.toMatchObject({ ok: true });
  });

  it("answers unauthenticated requests with 401 for APIs and a sign-in redirect for pages", async () => {
    const { proxy } = await import("@/proxy");
    fakes.session = { data: null, error: null };
    const api = await proxy(
      new NextRequest("https://distil.example/api/v1/feed", { headers: forgedHeaders })
    );
    expect(api.status).toBe(401);
    expect(api.headers.get("x-trace-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(fakes.loadRepositories).not.toHaveBeenCalled();

    const page = await proxy(new NextRequest("https://distil.example/feed"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("https://distil.example/sign-in");
  });

  it("fails closed with 503 when the auth repository cannot be loaded", async () => {
    const { proxy } = await import("@/proxy");
    fakes.loadRepositories.mockImplementation(() => {
      throw new Error("database-secret-detail");
    });
    const response = await proxy(new NextRequest("https://distil.example/api/v1/feed"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: { code: "AUTH_UNAVAILABLE", message: "Authentication is unavailable" },
    });
  });

  it("rate-limits an API client before spending any authentication work", async () => {
    const { proxy } = await import("@/proxy");
    const headers = { "x-forwarded-for": "203.0.113.7" };
    let last: Response | undefined;
    for (let attempt = 0; attempt < 61; attempt += 1) {
      last = await proxy(new NextRequest("https://distil.example/api/v1/collections", { headers }));
    }
    expect(last?.status).toBe(429);
    expect(fakes.provider.verifySession).toHaveBeenCalledTimes(60);
  });
});
