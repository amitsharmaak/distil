import { createNeonAuth } from "@neondatabase/auth/next/server";
import { getPostgresClient } from "@/lib/database";
import { PostgresAuthRepository } from "@/lib/postgres/auth-repository";
import { AccessDeniedError } from "@/lib/auth/account";
import { authFailureResponse } from "@/lib/auth/http";
import { legacyAuthDisabledResponse } from "@/lib/auth/legacy-bridge";
import { getNeonAuthServer, NeonAuthConfigurationError } from "@/lib/auth/neon-server";
import {
  AuthRepositoryUnavailableError,
  getAuthRepositoryPort,
} from "@/lib/auth/repository-runtime";
import type { AuthRepositoryPort } from "@/lib/auth/ports";

jest.mock("@neondatabase/auth/next/server", () => ({ createNeonAuth: jest.fn() }));
jest.mock("@/lib/database", () => ({ getPostgresClient: jest.fn() }));

const mockedCreateNeonAuth = jest.mocked(createNeonAuth);
const mockedPostgresClient = jest.mocked(getPostgresClient);

beforeEach(() => jest.clearAllMocks());

describe("auth runtime adapters", () => {
  it.each([
    [new AccessDeniedError("unauthenticated"), 401, "UNAUTHORIZED"],
    [new AccessDeniedError("disabled"), 403, "ACCESS_DENIED"],
    [new Error("database-secret-detail"), 503, "AUTH_UNAVAILABLE"],
  ] as const)("maps failures to a redacted HTTP response", async (error, status, code) => {
    const response = authFailureResponse(error);
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({
      error: { code, message: "Unable to continue" },
    });
  });

  it("keeps the disabled legacy route indistinguishable from a missing route", async () => {
    const response = legacyAuthDisabledResponse();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("fails closed, without caching the failure, when PostgreSQL is not configured", async () => {
    mockedPostgresClient.mockRejectedValueOnce(new Error("DATABASE_URL is required"));
    const failure = await getAuthRepositoryPort().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AuthRepositoryUnavailableError);
    expect(String(failure)).not.toContain("DATABASE_URL");

    // The next call retries instead of replaying the rejection.
    const sql = { tag: "shared-sql" };
    mockedPostgresClient.mockResolvedValue(sql as never);
    await expect(getAuthRepositoryPort()).resolves.toBeInstanceOf(PostgresAuthRepository);
    expect(mockedPostgresClient).toHaveBeenCalledTimes(2);
  });

  it("constructs only the auth adapter on the shared client, once", async () => {
    const first = await getAuthRepositoryPort();
    const second = await getAuthRepositoryPort();
    expect(second).toBe(first);
    expect((first as unknown as { sql: unknown }).sql).toEqual({ tag: "shared-sql" });
    const port: AuthRepositoryPort = first;
    expect(typeof port.findAccountByIdentity).toBe("function");
  });

  it("reports configuration names without exposing auth secret values", () => {
    const secret = "short-secret";
    expect(() =>
      getNeonAuthServer({
        FEATURE_NEON_AUTH: "true",
        NEON_AUTH_BASE_URL: "https://auth.example.test",
        NEON_AUTH_COOKIE_SECRET: secret,
      })
    ).toThrow(NeonAuthConfigurationError);
    try {
      getNeonAuthServer({ FEATURE_NEON_AUTH: "true" });
    } catch (error) {
      expect(error).toEqual(
        expect.objectContaining({
          missing: ["NEON_AUTH_BASE_URL", "NEON_AUTH_COOKIE_SECRET"],
          message: "Neon Auth is unavailable",
          name: "NeonAuthConfigurationError",
        })
      );
      expect(String(error)).not.toContain(secret);
    }
    expect(mockedCreateNeonAuth).not.toHaveBeenCalled();
  });

  it("constructs, caches, and rotates the provider only for the exact configuration", () => {
    const first = { provider: "first" };
    const second = { provider: "second" };
    mockedCreateNeonAuth.mockReturnValueOnce(first as never).mockReturnValueOnce(second as never);
    const environment = {
      FEATURE_NEON_AUTH: "true",
      NEON_AUTH_BASE_URL: "https://auth-cache.example.test",
      NEON_AUTH_COOKIE_SECRET: "one-secret-value-that-is-at-least-thirty-two-characters",
    };
    expect(getNeonAuthServer(environment)).toBe(first);
    expect(getNeonAuthServer({ ...environment })).toBe(first);
    expect(mockedCreateNeonAuth).toHaveBeenCalledWith({
      baseUrl: environment.NEON_AUTH_BASE_URL,
      cookies: {
        secret: environment.NEON_AUTH_COOKIE_SECRET,
        sessionDataTtl: 300,
        sameSite: "lax",
      },
      logLevel: "warn",
    });

    expect(
      getNeonAuthServer({
        ...environment,
        NEON_AUTH_COOKIE_SECRET: "two-secret-value-that-is-at-least-thirty-two-characters",
      })
    ).toBe(second);
    expect(mockedCreateNeonAuth).toHaveBeenCalledTimes(2);
  });
});
