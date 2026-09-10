import { NextRequest } from "next/server";

jest.mock("@/lib/auth/neon-server", () => ({ getNeonAuthServer: jest.fn() }));
jest.mock("@/lib/auth/repository-runtime", () => ({ getAuthRepositoryPort: jest.fn() }));
jest.mock("@/lib/database", () => ({ getTenantRepositories: jest.fn() }));

import { GET as completeSignIn } from "@/app/api/auth/sign-in/complete/route";
import { POST as requestSignIn } from "@/app/api/auth/sign-in/request-link/route";
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
    middleware: () =>
      jest.fn().mockResolvedValue(new Response(null, { headers: { "x-middleware-next": "1" } })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_API_BASE_URL = origin;
  const auth = authServer();
  mockedGetNeonAuthServer.mockReturnValue(auth as never);
  mockedGetAuthRepositoryPort.mockResolvedValue(repository());
  mockedGetTenantRepositories.mockResolvedValue({
    rateLimits: {
      consume: jest.fn().mockResolvedValue({
        allowed: true,
        remaining: 4,
        resetAt: "2026-09-10T16:00:00.000Z",
      }),
    },
  } as unknown as RepositorySet);
});

afterAll(() => {
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
});

it("dispatches a returning-user link through the tenant-scoped rate limit", async () => {
  const response = await requestSignIn(
    new Request(`${origin}/api/auth/sign-in/request-link`, {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.9, 10.0.0.1",
        "x-trace-id": "30000000-0000-4000-8000-000000000003",
      },
      body: JSON.stringify({ email: "amit@example.com" }),
    })
  );

  expect(response.status).toBe(202);
  expect(mockedGetTenantRepositories).toHaveBeenCalledWith(
    expect.objectContaining({ userId, actorKind: "system", actorId: userId })
  );
  const repositories = await mockedGetTenantRepositories.mock.results[0]!.value;
  expect(repositories.rateLimits.consume).toHaveBeenCalledWith(
    expect.objectContaining({
      key: "returning-login:203.0.113.9",
      operation: "returning-login",
      limit: 5,
      windowSeconds: 900,
    })
  );
});

it("fails closed when returning-user sign-in cannot be configured", async () => {
  mockedGetNeonAuthServer.mockImplementationOnce(() => {
    throw new Error("configuration unavailable");
  });
  const response = await requestSignIn(
    new Request(`${origin}/api/auth/sign-in/request-link`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ email: "amit@example.com" }),
    })
  );
  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toMatchObject({ error: { code: "AUTH_UNAVAILABLE" } });
});

it("exchanges the verifier and admits only the mapped active identity", async () => {
  const response = await completeSignIn(
    new NextRequest(`${origin}/api/auth/sign-in/complete?neon_auth_session_verifier=value`)
  );
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(`${origin}/`);
});

it("returns a provider exchange response before application completion", async () => {
  const auth = authServer();
  const exchange = Response.redirect(`${origin}/api/auth/sign-in/complete`, 307);
  auth.middleware = () => jest.fn().mockResolvedValue(exchange);
  mockedGetNeonAuthServer.mockReturnValue(auth as never);

  await expect(
    completeSignIn(new NextRequest(`${origin}/api/auth/sign-in/complete`))
  ).resolves.toBe(exchange);
  expect(mockedGetAuthRepositoryPort).not.toHaveBeenCalled();
});

it("redirects to access denied when completion infrastructure fails", async () => {
  mockedGetNeonAuthServer.mockImplementationOnce(() => {
    throw new Error("provider unavailable");
  });
  const response = await completeSignIn(new NextRequest(`${origin}/api/auth/sign-in/complete`));
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(`${origin}/access-denied`);
});
