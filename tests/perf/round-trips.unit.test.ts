/**
 * Performance regression fence (phase P0): the number of provider round trips,
 * authentication lookups and database transactions one request costs today.
 * Later phases lower these assertions on purpose; an accidental increase fails.
 */
import type { LinkedAccount } from "@/lib/auth/account";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import { createAuthContext, userIdSchema, type AuthContext } from "@/lib/contracts";
import { PROXY_TIMING_HEADER, recordDatabaseStatement } from "@/lib/observability/request-metrics";
import { createPostgresRepositoryAccess } from "@/lib/postgres/tenant-repositories";
import type { Sql } from "postgres";
import { NextRequest, NextResponse } from "next/server";

const userId = userIdSchema.parse("20000000-0000-4000-8000-000000000002");
const traceId = "30000000-0000-4000-8000-000000000003";
const context = createAuthContext({
  userId,
  actorKind: "user",
  actorId: userId,
  requestId: traceId,
});

const environment = {
  FEATURE_NEON_AUTH: "true",
  NEON_AUTH_BASE_URL: "https://auth.distil.example",
  NEON_AUTH_COOKIE_SECRET: "perf-baseline-cookie-secret-with-32-bytes-minimum",
  DATABASE_URL: "postgres://perf-baseline.invalid/distil",
  FEATURE_PERSONALIZATION: "true",
  DISTIL_ALLOWED_ORIGINS: "https://distil.example",
};

const fakes = {
  provider: {
    middleware: jest.fn(() => async () => NextResponse.next()),
    getSession: jest.fn(async () => ({
      data: {
        user: { id: "provider-subject", email: "amit@example.com", emailVerified: true },
        session: { id: "provider-session", createdAt: new Date() },
      },
      error: null,
    })),
  },
  authRepositories: {} as AuthRepositoryPort,
  tenantSql: undefined as unknown as Sql,
  transactions: 0,
  statements: [] as string[],
};

jest.mock("@/lib/auth/neon-server", () => ({
  getNeonAuthServer: () => fakes.provider,
}));
jest.mock("@/lib/auth/repository-runtime", () => ({
  getAuthRepositoryPort: async () => fakes.authRepositories,
}));
jest.mock("@/lib/database", () => ({
  getTenantRepositories: async (auth: AuthContext) =>
    createPostgresRepositoryAccess(fakes.tenantSql).getTenantRepositories(auth),
}));

function authRepositories(account: LinkedAccount): AuthRepositoryPort {
  return {
    createInvitation: jest.fn(),
    findInvitationById: jest.fn(),
    revokeInvitation: jest.fn(),
    claimInvitationDispatch: jest.fn(),
    completeInvitationDispatch: jest.fn(),
    failInvitationDispatch: jest.fn(),
    consumeInvitationAndLinkIdentity: jest.fn(),
    findAccountByEmail: jest.fn(),
    findAccountByIdentity: jest.fn(async () => {
      // Stands in for the postgres.js debug hook of the auth pool.
      recordDatabaseStatement("SELECT * FROM distil_resolve_auth_identity($1, $2)");
      return account;
    }),
  };
}

/**
 * The sqlDouble pattern from tenant-repositories.unit.test.ts, extended to
 * report every statement and `BEGIN` to the request metrics store the way the
 * postgres.js `debug` hook does for a real client.
 */
function sqlDouble() {
  const sql = jest.fn(async (strings: TemplateStringsArray): Promise<unknown[]> => {
    const query = strings.join("?");
    fakes.statements.push(query);
    recordDatabaseStatement(query);
    if (query.includes("current_setting('app.user_id'")) {
      return [
        {
          user_id: context.userId,
          actor_id: context.actorId,
          actor_kind: context.actorKind,
          request_id: context.requestId,
          environment: "runtime",
          search_path: "tenant_api, pg_catalog",
        },
      ];
    }
    if (query.includes("personal_preferences")) {
      return [
        {
          digest_enabled: false,
          digest_timezone: "UTC",
          personalization_enabled: true,
          updated_at: new Date("2026-09-16T00:00:00.000Z"),
        },
      ];
    }
    return [];
  }) as unknown as Sql;
  Object.assign(sql, {
    begin: jest.fn(async (operation: (transaction: Sql) => Promise<unknown>) => {
      fakes.transactions += 1;
      recordDatabaseStatement("begin");
      const result = await operation(sql);
      recordDatabaseStatement("commit");
      return result;
    }),
    savepoint: jest.fn(async (operation: (transaction: Sql) => Promise<unknown>) => operation(sql)),
    json: jest.fn((value: unknown) => value),
    array: jest.fn((value: unknown) => value),
  });
  return sql;
}

const originalEnvironment = { ...process.env };

beforeEach(() => {
  Object.assign(process.env, environment);
  fakes.provider.middleware.mockClear();
  fakes.provider.getSession.mockClear();
  fakes.authRepositories = authRepositories({ userId, status: "active" });
  fakes.tenantSql = sqlDouble();
  fakes.transactions = 0;
  fakes.statements = [];
});

afterAll(() => {
  process.env = originalEnvironment;
});

function middlewareInvocations(): number {
  return fakes.provider.middleware.mock.results.reduce((count, result) => {
    const handler = result.value as jest.Mock | ((request: NextRequest) => Promise<Response>);
    return count + (jest.isMockFunction(handler) ? handler.mock.calls.length : 1);
  }, 0);
}

describe("request cost baseline (P0)", () => {
  it("proxy: one authenticated GET costs two provider calls and one auth query", async () => {
    const { proxy } = await import("@/proxy");
    const response = await proxy(
      new NextRequest("https://distil.example/api/v1/feed", { method: "GET" })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-trace-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(fakes.provider.middleware).toHaveBeenCalledTimes(1);
    expect(middlewareInvocations()).toBe(1);
    expect(fakes.provider.getSession).toHaveBeenCalledTimes(1);
    expect(fakes.authRepositories.findAccountByIdentity).toHaveBeenCalledTimes(1);

    // Baseline: 2 provider round trips + 1 database query before the route runs.
    // API pass-throughs carry the timing as a forwarded request header (see
    // PROXY_TIMING_HEADER); Next.js exposes forwarded headers under this prefix.
    expect(response.headers.get("server-timing")).toBeNull();
    const proxyTiming = response.headers.get(`x-middleware-request-${PROXY_TIMING_HEADER}`) ?? "";
    expect(proxyTiming).toMatch(/^proxy-auth-provider;dur=\d+\.\d;desc="calls=2"/);
    expect(proxyTiming).toMatch(/, proxy-auth-db;dur=\d+\.\d;desc="q=1"/);
    expect(proxyTiming).toMatch(/, proxy;dur=\d+\.\d;desc="calls=2 q=1"$/);
  });

  it("proxy: pages receive the proxy timing directly and forged values are dropped", async () => {
    const { proxy } = await import("@/proxy");
    const response = await proxy(
      new NextRequest("https://distil.example/settings", {
        headers: { [PROXY_TIMING_HEADER]: 'evil;dur=0;desc="x"' },
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("server-timing")).toMatch(
      /^proxy-auth-provider;dur=\d+\.\d;desc="calls=2", proxy-auth-db;dur=\d+\.\d;desc="q=1", proxy;dur=\d+\.\d;desc="calls=2 q=1"$/
    );
    expect(response.headers.get(`x-middleware-request-${PROXY_TIMING_HEADER}`)).toBeNull();
  });

  it("GET /api/v1/feed: one provider call, one auth query and two transactions", async () => {
    const { GET } = await import("@/app/api/v1/feed/route");
    const response = await GET(
      new Request("https://distil.example/api/v1/feed", {
        headers: {
          "x-trace-id": traceId,
          "x-distil-user-id": userId,
          [PROXY_TIMING_HEADER]: 'proxy-auth-provider;dur=1.0;desc="calls=2", proxy;dur=2.0',
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ items: [] });
    // The route ignores the proxy's headers and re-resolves the identity.
    expect(fakes.provider.middleware).not.toHaveBeenCalled();
    expect(fakes.provider.getSession).toHaveBeenCalledTimes(1);
    expect(fakes.authRepositories.findAccountByIdentity).toHaveBeenCalledTimes(1);
    // Preferences (advisory-locked) and the feed page each open a transaction.
    expect(fakes.transactions).toBe(2);
    expect((fakes.tenantSql.begin as jest.Mock).mock.calls).toHaveLength(2);
    expect(
      fakes.statements.filter((statement) => statement.includes("AS search_path"))
    ).toHaveLength(2);

    const serverTiming = response.headers.get("server-timing") ?? "";
    expect(serverTiming).toMatch(
      /^proxy-auth-provider;dur=1\.0;desc="calls=2", proxy;dur=2\.0, auth;dur=\d+\.\d;desc="calls=1 q=1"/
    );
    expect(serverTiming).toMatch(/, db;dur=\d+\.\d;desc="q=\d+ tx=2"/);
    expect(serverTiming).toMatch(/, total;dur=\d+\.\d;desc="calls=1 q=\d+ tx=2"$/);
  });

  it("leaves responses untouched when nothing throws and errors propagate", async () => {
    const { withRequestMetrics } = await import("@/lib/observability/request-metrics");
    const failing = withRequestMetrics(async () => {
      throw new Error("boom");
    });
    await expect(failing()).rejects.toThrow("boom");

    const passing = withRequestMetrics(async () => Response.json({ ok: true }));
    const response = await passing();
    expect(response.headers.get("server-timing")).toMatch(/^total;dur=\d+\.\d$/);
    await expect(response.json()).resolves.toEqual({ ok: true });

    // A malformed forwarded value is ignored rather than echoed into the response.
    const guarded = withRequestMetrics(async (request: Request) =>
      Response.json({ path: new URL(request.url).pathname })
    );
    const forged = await guarded(
      new Request("https://distil.example/api/x", {
        headers: { [PROXY_TIMING_HEADER]: "total;dur=1<script>alert(1)</script>" },
      })
    );
    expect(forged.headers.get("server-timing")).toMatch(/^total;dur=\d+\.\d$/);
  });
});
