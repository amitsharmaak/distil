jest.mock("@/lib/database", () => ({ getRepositorySet: jest.fn() }));

import { getRepositorySet } from "@/lib/database";
import { hashPassword } from "@/lib/auth/password";
import { createSessionToken } from "@/lib/auth/session";
import type {
  CaptureTokenRepository,
  RateLimitRepository,
  RepositorySet,
} from "@/lib/repositories/ports";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import { GET as sessionGet } from "@/app/api/auth/session/route";
import { GET as tokensGet, POST as tokensPost } from "@/app/api/v1/capture-tokens/route";
import { DELETE as tokenDelete } from "@/app/api/v1/capture-tokens/[id]/route";

const origin = "https://distil.example";
const sessionSecret = "a-secure-session-secret-with-more-than-32-bytes";
const mockGetRepositorySet = getRepositorySet as jest.MockedFunction<typeof getRepositorySet>;
let passwordHash: string;
let captureTokens: jest.Mocked<CaptureTokenRepository>;
let rateLimits: jest.Mocked<RateLimitRepository>;

function request(path: string, init: RequestInit & { json?: unknown } = {}): Request {
  const { json, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  if (json !== undefined) {
    headers.set("content-type", "application/json");
    requestInit.body = JSON.stringify(json);
  }
  return new Request(`${origin}${path}`, { ...requestInit, headers });
}

async function sessionCookie(): Promise<string> {
  return `distil_session=${await createSessionToken(sessionSecret)}`;
}

beforeAll(async () => {
  passwordHash = await hashPassword("correct-password", Buffer.alloc(16, 9));
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DISTIL_ALLOWED_ORIGINS = origin;
  process.env.DISTIL_SESSION_SECRET = sessionSecret;
  process.env.DISTIL_WEB_PASSWORD_HASH = passwordHash;
  captureTokens = {
    create: jest.fn().mockResolvedValue(undefined),
    findActiveByHash: jest.fn(),
    list: jest.fn().mockResolvedValue([
      {
        id: "token-id",
        name: "iPhone",
        tokenPrefix: "dst_cap_abcdefgh",
        createdAt: "2026-03-01T00:00:00Z",
      },
    ]),
    revoke: jest.fn().mockResolvedValue(true),
    touchLastUsed: jest.fn(),
  };
  rateLimits = {
    consume: jest.fn().mockResolvedValue({
      allowed: true,
      remaining: 9,
      resetAt: "2026-03-01T00:15:00Z",
    }),
  };
  mockGetRepositorySet.mockResolvedValue({ captureTokens, rateLimits } as unknown as RepositorySet);
});

afterAll(() => {
  delete process.env.DISTIL_ALLOWED_ORIGINS;
  delete process.env.DISTIL_SESSION_SECRET;
  delete process.env.DISTIL_WEB_PASSWORD_HASH;
});

describe("POST /api/auth/login", () => {
  it("returns INVALID_REQUEST for malformed input", async () => {
    const response = await loginPost(
      request("/api/auth/login", {
        method: "POST",
        headers: { origin },
        body: "not-json",
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INVALID_REQUEST" } });
    expect(mockGetRepositorySet).not.toHaveBeenCalled();
  });

  it("returns ORIGIN_NOT_ALLOWED before checking credentials", async () => {
    const response = await loginPost(
      request("/api/auth/login", {
        method: "POST",
        headers: { origin: "https://hostile.example" },
        json: { password: "correct-password" },
      })
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "ORIGIN_NOT_ALLOWED" },
    });
    expect(mockGetRepositorySet).not.toHaveBeenCalled();
  });

  it("rate limits attempts by client IP and rejects a wrong password", async () => {
    const loginRequest = request("/api/auth/login", {
      method: "POST",
      headers: { origin, "x-forwarded-for": "203.0.113.4, 10.0.0.1" },
      json: { password: "wrong" },
    });
    const unauthorized = await loginPost(loginRequest);
    expect(unauthorized.status).toBe(401);
    expect(rateLimits.consume).toHaveBeenCalledWith(
      expect.objectContaining({ key: "login:203.0.113.4", limit: 10, windowSeconds: 900 })
    );

    rateLimits.consume.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: "2026-03-01T00:15:00Z",
    });
    const limited = await loginPost(
      request("/api/auth/login", {
        method: "POST",
        headers: { origin, "x-real-ip": "203.0.113.5" },
        json: { password: "correct-password" },
      })
    );
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({ error: { code: "RATE_LIMITED" } });
  });

  it("sets a hardened 30-day session cookie after valid credentials", async () => {
    const response = await loginPost(
      request("/api/auth/login", {
        method: "POST",
        headers: { origin },
        json: { password: "correct-password" },
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toEqual(
      expect.stringMatching(
        /^distil_session=.+; Path=\/; Expires=.+; Max-Age=2592000; Secure; HttpOnly; SameSite=lax$/
      )
    );
  });

  it("does not expose secrets from unexpected infrastructure failures", async () => {
    rateLimits.consume.mockRejectedValue(new Error(`database failed: ${sessionSecret}`));
    const response = await loginPost(
      request("/api/auth/login", {
        method: "POST",
        headers: { origin },
        json: { password: "correct-password" },
      })
    );
    expect(response.status).toBe(500);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).not.toContain(sessionSecret);
    expect(serialized).not.toContain(passwordHash);
    expect(serialized).toContain("PROCESSING_FAILED");
  });
});

describe("session routes", () => {
  it("GET reports authentication without exposing claims", async () => {
    const anonymous = await sessionGet(request("/api/auth/session"));
    await expect(anonymous.json()).resolves.toEqual({ authenticated: false });
    const authenticated = await sessionGet(
      request("/api/auth/session", { headers: { cookie: await sessionCookie() } })
    );
    await expect(authenticated.json()).resolves.toEqual({ authenticated: true });
  });

  it("POST logout requires origin and session, then expires the cookie", async () => {
    const noOrigin = await logoutPost(
      request("/api/auth/logout", { method: "POST", headers: { cookie: await sessionCookie() } })
    );
    expect(noOrigin.status).toBe(403);
    const noSession = await logoutPost(
      request("/api/auth/logout", { method: "POST", headers: { origin } })
    );
    expect(noSession.status).toBe(401);
    const response = await logoutPost(
      request("/api/auth/logout", {
        method: "POST",
        headers: { origin, cookie: await sessionCookie() },
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("distil_session=; Path=/");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("/api/v1/capture-tokens", () => {
  it("GET requires a valid session and never returns token hashes", async () => {
    const denied = await tokensGet(request("/api/v1/capture-tokens"));
    expect(denied.status).toBe(401);
    const response = await tokensGet(
      request("/api/v1/capture-tokens", { headers: { cookie: await sessionCookie() } })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tokens).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("tokenHash");
  });

  it("POST enforces origin and validates the display name", async () => {
    const cookie = await sessionCookie();
    const hostile = await tokensPost(
      request("/api/v1/capture-tokens", {
        method: "POST",
        headers: { cookie, origin: "https://hostile.example" },
        json: { name: "iPhone" },
      })
    );
    expect(hostile.status).toBe(403);
    const invalid = await tokensPost(
      request("/api/v1/capture-tokens", {
        method: "POST",
        headers: { cookie, origin },
        json: { name: " " },
      })
    );
    expect(invalid.status).toBe(400);
    expect(captureTokens.create).not.toHaveBeenCalled();
  });

  it("POST creates a token, returns plaintext once, and stores only a hash", async () => {
    const response = await tokensPost(
      request("/api/v1/capture-tokens", {
        method: "POST",
        headers: { origin, cookie: await sessionCookie() },
        json: { name: "iPhone" },
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.token.token).toMatch(/^dst_cap_/);
    const persisted = captureTokens.create.mock.calls[0][0];
    expect(persisted.tokenHash).toBeDefined();
    expect(JSON.stringify(persisted)).not.toContain(body.token.token);
  });

  it("DELETE independently revokes an existing token", async () => {
    const response = await tokenDelete(
      request("/api/v1/capture-tokens/token-id", {
        method: "DELETE",
        headers: { origin, cookie: await sessionCookie() },
      }),
      { params: Promise.resolve({ id: "token-id" }) }
    );
    expect(response.status).toBe(204);
    expect(captureTokens.revoke).toHaveBeenCalledWith("token-id", expect.any(String));
  });

  it("DELETE returns CAPTURE_NOT_FOUND for an absent or already-revoked token", async () => {
    captureTokens.revoke.mockResolvedValue(false);
    const response = await tokenDelete(
      request("/api/v1/capture-tokens/missing", {
        method: "DELETE",
        headers: { origin, cookie: await sessionCookie() },
      }),
      { params: Promise.resolve({ id: "missing" }) }
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CAPTURE_NOT_FOUND" },
    });
  });
});
