import { NextRequest } from "next/server";

import type { LinkedAccount } from "@/lib/auth/account";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import { createSessionToken } from "@/lib/auth/session";
import { recordDatabaseStatement } from "@/lib/observability/request-metrics";
import { P8_PROXY_PROBE_QUERY } from "@/proxy";

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

async function signedInRequest(path = "/feed", options: { method?: string; origin?: string } = {}) {
  const token = await createSessionToken(sessionSecret);
  const { proxy } = await import("@/proxy");
  return proxy(
    new NextRequest(`https://distil.example${path}`, {
      method: options.method,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
        ...(options.origin ? { origin: options.origin } : {}),
      },
    })
  );
}

const probePath = `/feed?${P8_PROXY_PROBE_QUERY}=1`;

describe("P8 legacy Preview connection probe", () => {
  it("does not load or query the repository without the explicit query flag", async () => {
    const response = await signedInRequest();

    expect(response.status).toBe(200);
    expect(fakes.loadRepositories).not.toHaveBeenCalled();
    expect(fakes.findAccountByIdentity).not.toHaveBeenCalled();
    expect(response.headers.get("server-timing")).not.toContain("proxy-auth-connect");
    expect(response.headers.get("server-timing")).not.toContain("proxy-auth-db");
  });

  it("does not probe when legacy authentication rejects the request", async () => {
    const { proxy } = await import("@/proxy");
    const response = await proxy(new NextRequest(`https://distil.example${probePath}`));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://distil.example/login?next=%2Ffeed%3F__distil_p8_probe%3D1"
    );
    expect(fakes.loadRepositories).not.toHaveBeenCalled();
    expect(fakes.findAccountByIdentity).not.toHaveBeenCalled();
  });

  it("records exactly two identical missing-identity lookups after successful legacy auth", async () => {
    const response = await signedInRequest(probePath);

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
    const serverTiming = response.headers.get("server-timing");
    expect(serverTiming).toMatch(
      /^proxy-auth-connect;dur=\d+\.\d;desc="q=1", proxy-auth-db;dur=\d+\.\d;desc="q=1", proxy;dur=\d+\.\d;desc="q=2"$/
    );
    await expect(response.json()).resolves.toEqual({ serverTiming });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });

  it("ignores both lookup results so legacy auth remains authoritative", async () => {
    fakes.findAccountByIdentity.mockImplementation(async () => {
      recordDatabaseStatement("SELECT * FROM distil_resolve_auth_identity($1, $2)");
      return {
        userId: "20000000-0000-4000-8000-000000000002",
        status: "suspended",
      } as LinkedAccount;
    });

    const response = await signedInRequest(probePath);

    expect(response.status).toBe(200);
    expect(fakes.findAccountByIdentity).toHaveBeenCalledTimes(2);
  });

  it("keeps probe failures non-authoritative and out of the JSON response", async () => {
    fakes.findAccountByIdentity
      .mockImplementationOnce(async () => {
        recordDatabaseStatement("SELECT * FROM distil_resolve_auth_identity($1, $2)");
        return undefined;
      })
      .mockRejectedValueOnce(new Error("private database failure"));

    const response = await signedInRequest(probePath);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fakes.findAccountByIdentity).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(body)).not.toContain("private database failure");
    expect(body).toEqual({ serverTiming: response.headers.get("server-timing") });
  });

  it("does not probe a non-GET request even when the query flag is present", async () => {
    const response = await signedInRequest(probePath, {
      method: "POST",
      origin: "https://distil.example",
    });

    expect(response.status).toBe(200);
    expect(fakes.loadRepositories).not.toHaveBeenCalled();
    expect(fakes.findAccountByIdentity).not.toHaveBeenCalled();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
