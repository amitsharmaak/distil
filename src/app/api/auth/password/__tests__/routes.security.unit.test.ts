jest.mock("@/lib/auth/neon-server", () => ({ getNeonAuthServer: jest.fn() }));
jest.mock("@/lib/auth/repository-runtime", () => ({ getAuthRepositoryPort: jest.fn() }));
jest.mock("@/lib/database", () => ({ getTenantRepositories: jest.fn() }));

import { POST as changePassword } from "@/app/api/auth/password/change/route";
import { POST as requestReset } from "@/app/api/auth/password/request-reset/route";
import { POST as resetPassword } from "@/app/api/auth/password/reset/route";
import { POST as signInWithPassword } from "@/app/api/auth/sign-in/password/route";
import { getNeonAuthServer } from "@/lib/auth/neon-server";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";
import { getTenantRepositories } from "@/lib/database";
import type { RepositorySet } from "@/lib/repositories/ports";

const origin = "https://distil.example";
const userId = "20000000-0000-4000-8000-000000000002";
const mockedGetNeonAuthServer = jest.mocked(getNeonAuthServer);
const mockedGetAuthRepositoryPort = jest.mocked(getAuthRepositoryPort);
const mockedGetTenantRepositories = jest.mocked(getTenantRepositories);

function repository(): jest.Mocked<AuthRepositoryPort> {
  return {
    createInvitation: jest.fn(),
    findInvitationById: jest.fn(),
    revokeInvitation: jest.fn(),
    claimInvitationDispatch: jest.fn(),
    completeInvitationDispatch: jest.fn(),
    failInvitationDispatch: jest.fn(),
    consumeInvitationAndLinkIdentity: jest.fn(),
    findAccountByEmail: jest.fn().mockResolvedValue({
      userId,
      primaryEmail: "amit@example.com",
      status: "active",
    }),
    findAccountByIdentity: jest.fn().mockResolvedValue({
      userId,
      primaryEmail: "amit@example.com",
      status: "active",
    }),
  };
}

function authServer() {
  return {
    getSession: jest.fn().mockResolvedValue({
      data: {
        user: { id: "provider-subject", email: "amit@example.com", emailVerified: true },
        session: { id: "provider-session", createdAt: new Date() },
      },
      error: null,
    }),
    handler: () => ({
      POST: jest
        .fn()
        .mockResolvedValue(
          Response.json(
            { ok: true },
            { headers: { "set-cookie": "provider-challenge=value; Path=/; Secure; HttpOnly" } }
          )
        ),
    }),
  };
}

function consumeMock() {
  return jest.fn().mockResolvedValue({
    allowed: true,
    remaining: 4,
    resetAt: "2026-09-10T16:00:00.000Z",
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_API_BASE_URL = origin;
  process.env.DISTIL_ALLOWED_ORIGINS = origin;
  mockedGetNeonAuthServer.mockReturnValue(authServer() as never);
  mockedGetAuthRepositoryPort.mockResolvedValue(repository());
  mockedGetTenantRepositories.mockResolvedValue({
    rateLimits: { consume: consumeMock() },
  } as unknown as RepositorySet);
});

afterAll(() => {
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  delete process.env.DISTIL_ALLOWED_ORIGINS;
});

describe("sign-in/password route", () => {
  it("consumes both the ip and account rate-limit keys with the expected limits", async () => {
    const response = await signInWithPassword(
      new Request(`${origin}/api/auth/sign-in/password`, {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.9, 10.0.0.1",
        },
        body: JSON.stringify({ email: "amit@example.com", password: "correct-horse-battery" }),
      })
    );

    expect(response.status).toBe(200);
    const repositories = await mockedGetTenantRepositories.mock.results[0]!.value;
    expect(repositories.rateLimits.consume).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "password-login:203.0.113.9",
        operation: "password-login",
        limit: 10,
        windowSeconds: 900,
      })
    );
    expect(repositories.rateLimits.consume).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `password-login-account:${userId}`,
        operation: "password-login-account",
        limit: 10,
        windowSeconds: 900,
      })
    );
    expect(repositories.rateLimits.consume).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the provider cannot be configured", async () => {
    mockedGetNeonAuthServer.mockImplementationOnce(() => {
      throw new Error("configuration unavailable");
    });
    const response = await signInWithPassword(
      new Request(`${origin}/api/auth/sign-in/password`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ email: "amit@example.com", password: "correct-horse-battery" }),
      })
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "AUTH_UNAVAILABLE" } });
  });
});

describe("password/request-reset route", () => {
  it("dispatches the reset through the tenant-scoped rate limit", async () => {
    const response = await requestReset(
      new Request(`${origin}/api/auth/password/request-reset`, {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.9",
        },
        body: JSON.stringify({ email: "amit@example.com" }),
      })
    );
    expect(response.status).toBe(202);
    const repositories = await mockedGetTenantRepositories.mock.results[0]!.value;
    expect(repositories.rateLimits.consume).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "password-reset:203.0.113.9",
        operation: "password-reset",
        limit: 5,
        windowSeconds: 900,
      })
    );
  });

  it("fails closed when the provider cannot be configured", async () => {
    mockedGetNeonAuthServer.mockImplementationOnce(() => {
      throw new Error("configuration unavailable");
    });
    const response = await requestReset(
      new Request(`${origin}/api/auth/password/request-reset`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ email: "amit@example.com" }),
      })
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "AUTH_UNAVAILABLE" } });
  });
});

describe("password/reset route", () => {
  it("resets the password on provider success", async () => {
    const response = await resetPassword(
      new Request(`${origin}/api/auth/password/reset`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ token: "good-token", newPassword: "a".repeat(12) }),
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ reset: true });
  });

  it("fails closed when the provider cannot be configured", async () => {
    mockedGetNeonAuthServer.mockImplementationOnce(() => {
      throw new Error("configuration unavailable");
    });
    const response = await resetPassword(
      new Request(`${origin}/api/auth/password/reset`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ token: "good-token", newPassword: "a".repeat(12) }),
      })
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "AUTH_UNAVAILABLE" } });
  });
});

describe("password/change route", () => {
  it("changes the password for the mapped active session", async () => {
    const response = await changePassword(
      new Request(`${origin}/api/auth/password/change`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", cookie: "session=abc" },
        body: JSON.stringify({ currentPassword: "old-password", newPassword: "a".repeat(12) }),
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ changed: true });
  });

  it("rejects a disallowed origin before touching the provider", async () => {
    const response = await changePassword(
      new Request(`${origin}/api/auth/password/change`, {
        method: "POST",
        headers: {
          origin: "https://hostile.example",
          "content-type": "application/json",
          cookie: "session=abc",
        },
        body: JSON.stringify({ currentPassword: "old-password", newPassword: "a".repeat(12) }),
      })
    );
    expect(response.status).toBe(503);
    expect(mockedGetNeonAuthServer).not.toHaveBeenCalled();
  });

  it("fails closed when the provider cannot be configured", async () => {
    mockedGetNeonAuthServer.mockImplementationOnce(() => {
      throw new Error("configuration unavailable");
    });
    const response = await changePassword(
      new Request(`${origin}/api/auth/password/change`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", cookie: "session=abc" },
        body: JSON.stringify({ currentPassword: "old-password", newPassword: "a".repeat(12) }),
      })
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "AUTH_UNAVAILABLE" } });
  });
});
