import { NextRequest } from "next/server";

import type { LinkedAccount } from "@/lib/auth/account";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import { createSessionToken } from "@/lib/auth/session";
import { P8_PROXY_PROBE_HEADER } from "@/lib/middleware/auth";
import { recordDatabaseStatement } from "@/lib/observability/request-metrics";

const sessionSecret = "p8-legacy-preview-session-secret-with-32-bytes";
const missingProbeSubject = "urn:distil:perf-probe:p8:missing";

const fakes = {
  findAccountByIdentity: jest.fn<Promise<LinkedAccount | undefined>, [unknown]>(),
  loadRepositories: jest.fn(),
};

const repositories = {
  findAccountByIdentity: fakes.findAccountByIdentity,
} as unknown as AuthRepositoryPort;

jest.mock("@/lib/auth/repository-runtime", () => ({
  getAuthRepositoryPort: async () => {
    fakes.loadRepositories();
    return repositories;
  },
}));

jest.mock("@/lib/auth/neon-server", () => ({
  getNeonProxyProvider: () => {
    throw new Error("legacy P8 probe must not construct the Neon provider");
  },
}));

const originalEnvironment = { ...process.env };

beforeEach(() => {
  process.env.FEATURE_NEON_AUTH = "false";
  process.env.DISTIL_WEB_PASSWORD_HASH = "scrypt$16384$8$1$salt$hash";
  process.env.DISTIL_SESSION_SECRET = sessionSecret;
  process.env.DISTIL_ALLOWED_ORIGINS = "https://distil.example";
  delete process.env.DISTIL_TEST_MODE;

  fakes.loadRepositories.mockClear();
  fakes.findAccountByIdentity.mockReset();
  fakes.findAccountByIdentity.mockImplementation(async () => {
    recordDatabaseStatement("SELECT * FROM distil_resolve_auth_identity($1, $2)");
    return undefined;
  });
});

afterAll(() => {
  process.env = originalEnvironment;
});

async function signedInRequest(headers: Record<string, string> = {}) {
  const token = await createSessionToken(sessionSecret);
  const { proxy } = await import("@/proxy");
  return proxy(
    new NextRequest("https://distil.example/feed", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
        ...headers,
      },
    })
  );
}

describe("P8 legacy Preview connection probe", () => {
  it("does not load or query the repository without the explicit probe header", async () => {
    const response = await signedInRequest();

    expect(response.status).toBe(200);
    expect(fakes.loadRepositories).not.toHaveBeenCalled();
    expect(fakes.findAccountByIdentity).not.toHaveBeenCalled();
    expect(response.headers.get("server-timing")).not.toContain("proxy-auth-connect");
    expect(response.headers.get("server-timing")).not.toContain("proxy-auth-db");
  });

  it("does not probe when legacy authentication rejects the request", async () => {
    const { proxy } = await import("@/proxy");
    const response = await proxy(
      new NextRequest("https://distil.example/feed", {
        headers: { [P8_PROXY_PROBE_HEADER]: "1" },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://distil.example/login?next=%2Ffeed");
    expect(fakes.loadRepositories).not.toHaveBeenCalled();
    expect(fakes.findAccountByIdentity).not.toHaveBeenCalled();
  });

  it("records exactly two identical missing-identity lookups after successful legacy auth", async () => {
    const response = await signedInRequest({ [P8_PROXY_PROBE_HEADER]: "1" });

    expect(response.status).toBe(200);
    expect(fakes.loadRepositories).toHaveBeenCalledTimes(1);
    expect(fakes.findAccountByIdentity).toHaveBeenCalledTimes(2);
    expect(fakes.findAccountByIdentity).toHaveBeenNthCalledWith(1, {
      provider: "neon",
      providerSubject: missingProbeSubject,
    });
    expect(fakes.findAccountByIdentity).toHaveBeenNthCalledWith(2, {
      provider: "neon",
      providerSubject: missingProbeSubject,
    });
    expect(response.headers.get("server-timing")).toMatch(
      /^proxy-auth-connect;dur=\d+\.\d;desc="q=1", proxy-auth-db;dur=\d+\.\d;desc="q=1", proxy;dur=\d+\.\d;desc="q=2"$/
    );
    expect(response.headers.get(`x-middleware-request-${P8_PROXY_PROBE_HEADER}`)).toBeNull();
  });

  it("ignores both lookup results so legacy auth remains authoritative", async () => {
    fakes.findAccountByIdentity.mockImplementation(async () => {
      recordDatabaseStatement("SELECT * FROM distil_resolve_auth_identity($1, $2)");
      return {
        userId: "20000000-0000-4000-8000-000000000002",
        status: "suspended",
      } as LinkedAccount;
    });

    const response = await signedInRequest({ [P8_PROXY_PROBE_HEADER]: "1" });

    expect(response.status).toBe(200);
    expect(fakes.findAccountByIdentity).toHaveBeenCalledTimes(2);
  });
});
