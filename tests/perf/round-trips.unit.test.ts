/**
 * Performance regression fence: the number of provider round trips,
 * authentication lookups, database transactions and statements one request
 * costs.
 *
 * P0 pinned the baseline (proxy: two provider calls + one auth query; route:
 * one provider call + one auth query + two transactions). P1 lowered it to
 * proxy: one + one and route: zero + zero through the signed identity
 * handoff. P2 folds the route's repository calls into ONE tenant transaction
 * whose context is verified by a single statement, so GET /api/v1/feed costs
 * one transaction and three statements (verification, preferences, feed).
 * Later phases lower the remaining assertions on purpose; an accidental
 * increase fails.
 */
import type { LinkedAccount } from "@/lib/auth/account";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import type { VerifiedProviderSession } from "@/lib/auth/neon-proxy";
import { createIdentityToken, IDENTITY_HEADER } from "@/lib/auth/identity-token";
import { createAuthContext, userIdSchema, type AuthContext } from "@/lib/contracts";
import { PROXY_TIMING_HEADER, recordDatabaseStatement } from "@/lib/observability/request-metrics";
import { createPostgresRepositoryAccess } from "@/lib/postgres/tenant-repositories";
import type { Sql } from "postgres";
import { NextRequest } from "next/server";

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
    verifySession: jest.fn(
      async (): Promise<VerifiedProviderSession> => ({
        session: {
          data: {
            user: { id: "provider-subject", email: "amit@example.com", emailVerified: true },
            session: { id: "provider-session", createdAt: new Date() },
          },
          error: null,
        },
        headers: new Headers(),
      })
    ),
  },
  authRepositories: {} as AuthRepositoryPort,
  tenantSql: undefined as unknown as Sql,
  transactions: 0,
  statements: [] as string[],
  /** The request id the tenant transaction's verification SELECT reports back. */
  requestId: traceId,
};

jest.mock("@/lib/auth/neon-server", () => ({
  getNeonProxyProvider: () => fakes.provider,
  getNeonAuthServer: () => {
    throw new Error("the route must not construct the provider");
  },
}));
jest.mock("@/lib/auth/repository-runtime", () => ({
  getAuthRepositoryPort: async () => fakes.authRepositories,
}));
jest.mock("@/lib/database", () => ({
  getTenantRepositories: async (auth: AuthContext) =>
    createPostgresRepositoryAccess(fakes.tenantSql).getTenantRepositories(auth),
  withTenantRepositories: async (auth: AuthContext, operation: never) =>
    createPostgresRepositoryAccess(fakes.tenantSql).withTenantRepositories(auth, operation),
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
 * postgres.js `debug` hook does for a real client. Like postgres.js, a tagged
 * template is lazy: it only becomes a statement when awaited, so fragments
 * spliced into another query (WHERE clauses, ranking expressions) never count.
 */
function sqlDouble() {
  const execute = async (query: string): Promise<unknown[]> => {
    fakes.statements.push(query);
    recordDatabaseStatement(query);
    if (query.includes("current_setting('app.user_id'")) {
      return [
        {
          user_id: context.userId,
          actor_id: context.actorId,
          actor_kind: context.actorKind,
          request_id: fakes.requestId,
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
  };
  const sql = jest.fn((strings: TemplateStringsArray): PromiseLike<unknown[]> => {
    const query = strings.join("?");
    let pending: Promise<unknown[]> | undefined;
    return {
      then: (resolve, reject) => (pending ??= execute(query)).then(resolve, reject),
    };
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
    // Static column lists are spliced in as fragments, not sent as statements.
    unsafe: jest.fn((text: string) => text),
  });
  return sql;
}

const originalEnvironment = { ...process.env };

beforeEach(() => {
  Object.assign(process.env, environment);
  fakes.provider.verifySession.mockClear();
  fakes.authRepositories = authRepositories({ userId, status: "active" });
  fakes.tenantSql = sqlDouble();
  fakes.transactions = 0;
  fakes.statements = [];
  fakes.requestId = traceId;
});

afterAll(() => {
  process.env = originalEnvironment;
});

/** Headers Next.js will hand to the route, as exposed on the pass-through response. */
function forwarded(response: Response, name: string): string {
  return response.headers.get(`x-middleware-request-${name}`) ?? "";
}

/** The statements a tenant-bound operation issues to verify its context. */
function verificationStatements(): string[] {
  return fakes.statements.filter((statement) => statement.includes("AS search_path"));
}

describe("request cost fence (P2: one transaction, three statements)", () => {
  it("proxy: one authenticated GET costs one provider call and one auth query", async () => {
    const { proxy } = await import("@/proxy");
    const response = await proxy(
      new NextRequest("https://distil.example/api/v1/feed", { method: "GET" })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-trace-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(fakes.provider.verifySession).toHaveBeenCalledTimes(1);
    expect(fakes.authRepositories.findAccountByIdentity).toHaveBeenCalledTimes(1);

    // API pass-throughs carry the timing as a forwarded request header (see
    // PROXY_TIMING_HEADER); Next.js exposes forwarded headers under this prefix.
    expect(response.headers.get("server-timing")).toBeNull();
    const proxyTiming = forwarded(response, PROXY_TIMING_HEADER);
    expect(proxyTiming).toMatch(/^proxy-auth-provider;dur=\d+\.\d;desc="calls=1"/);
    expect(proxyTiming).toMatch(/, proxy-auth-db;dur=\d+\.\d;desc="q=1"/);
    expect(proxyTiming).toMatch(/, proxy;dur=\d+\.\d;desc="calls=1 q=1"$/);
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
      /^proxy-auth-provider;dur=\d+\.\d;desc="calls=1", proxy-auth-db;dur=\d+\.\d;desc="q=1", proxy;dur=\d+\.\d;desc="calls=1 q=1"$/
    );
    expect(forwarded(response, PROXY_TIMING_HEADER)).toBe("");
  });

  it("proxy: public paths cost nothing", async () => {
    const { proxy } = await import("@/proxy");
    const response = await proxy(new NextRequest("https://distil.example/api/health"));
    expect(response.status).toBe(200);
    expect(fakes.provider.verifySession).not.toHaveBeenCalled();
    expect(fakes.authRepositories.findAccountByIdentity).not.toHaveBeenCalled();
    expect(forwarded(response, PROXY_TIMING_HEADER)).toMatch(/^proxy;dur=\d+\.\d$/);
  });

  it("GET /api/v1/feed with the proxy's token: zero provider calls, zero auth queries, one transaction, three statements", async () => {
    const { GET } = await import("@/app/api/v1/feed/route");
    const token = await createIdentityToken(
      { userId, actorKind: "user", fresh: true, traceId },
      environment.NEON_AUTH_COOKIE_SECRET
    );
    const response = await GET(
      new Request("https://distil.example/api/v1/feed", {
        headers: {
          "x-trace-id": traceId,
          [IDENTITY_HEADER]: token,
          [PROXY_TIMING_HEADER]: 'proxy-auth-provider;dur=1.0;desc="calls=1", proxy;dur=2.0',
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ items: [] });
    // The route trusts only the signed handoff and performs no auth I/O.
    expect(fakes.provider.verifySession).not.toHaveBeenCalled();
    expect(fakes.authRepositories.findAccountByIdentity).not.toHaveBeenCalled();
    // Preferences and the feed page share ONE tenant transaction, verified by
    // a single statement that both sets and reads back the tenant context.
    expect(fakes.transactions).toBe(1);
    expect((fakes.tenantSql.begin as jest.Mock).mock.calls).toHaveLength(1);
    const verification = verificationStatements();
    expect(verification).toHaveLength(1);
    expect(verification[0]).toContain("set_config('app.user_id'");
    expect(verification[0]).toContain("current_setting('app.user_id'");
    // verification + preferences SELECT + feed SELECT
    expect(fakes.statements).toHaveLength(3);
    expect(
      fakes.statements.filter((statement) => statement.includes("personal_preferences"))
    ).toHaveLength(1);

    const serverTiming = response.headers.get("server-timing") ?? "";
    expect(serverTiming).toMatch(
      /^proxy-auth-provider;dur=1\.0;desc="calls=1", proxy;dur=2\.0, auth;dur=\d+\.\d, db;dur=\d+\.\d;desc="q=3 tx=1"/
    );
    expect(serverTiming).toMatch(/, total;dur=\d+\.\d;desc="q=3 tx=1"$/);
  });

  it("GET /api/v1/feed with personalization off costs one transaction and two statements", async () => {
    delete process.env.FEATURE_PERSONALIZATION;
    try {
      const { GET } = await import("@/app/api/v1/feed/route");
      const token = await createIdentityToken(
        { userId, actorKind: "user", fresh: true, traceId },
        environment.NEON_AUTH_COOKIE_SECRET
      );
      const response = await GET(
        new Request("https://distil.example/api/v1/feed", {
          headers: { "x-trace-id": traceId, [IDENTITY_HEADER]: token },
        })
      );
      expect(response.status).toBe(200);
      expect(fakes.transactions).toBe(1);
      expect(verificationStatements()).toHaveLength(1);
      // verification + feed SELECT; no preferences lookup without the flag.
      expect(fakes.statements).toHaveLength(2);
      expect(fakes.statements.some((statement) => statement.includes("personal_preferences"))).toBe(
        false
      );
      expect(response.headers.get("server-timing")).toMatch(/, total;dur=\d+\.\d;desc="q=2 tx=1"$/);
    } finally {
      process.env.FEATURE_PERSONALIZATION = environment.FEATURE_PERSONALIZATION;
    }
  });

  it("end to end: the proxy's forwarded headers let the route skip authentication entirely", async () => {
    const { proxy } = await import("@/proxy");
    const { GET } = await import("@/app/api/v1/feed/route");
    const proxied = await proxy(new NextRequest("https://distil.example/api/v1/feed"));
    expect(proxied.status).toBe(200);
    fakes.requestId = forwarded(proxied, "x-trace-id");

    const response = await GET(
      new Request("https://distil.example/api/v1/feed", {
        headers: {
          "x-trace-id": forwarded(proxied, "x-trace-id"),
          [IDENTITY_HEADER]: forwarded(proxied, IDENTITY_HEADER),
          [PROXY_TIMING_HEADER]: forwarded(proxied, PROXY_TIMING_HEADER),
        },
      })
    );
    expect(response.status).toBe(200);
    // Whole request: exactly one provider call and one auth query, both in the proxy.
    expect(fakes.provider.verifySession).toHaveBeenCalledTimes(1);
    expect(fakes.authRepositories.findAccountByIdentity).toHaveBeenCalledTimes(1);
    expect(response.headers.get("server-timing")).toMatch(
      /^proxy-auth-provider;dur=\d+\.\d;desc="calls=1", proxy-auth-db;dur=\d+\.\d;desc="q=1", proxy;dur=\d+\.\d;desc="calls=1 q=1", auth;dur=\d+\.\d, db;dur=/
    );
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
