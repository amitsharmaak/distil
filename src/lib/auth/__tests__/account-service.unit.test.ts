import { resolveCurrentAccount, resolveRequestAuthContext } from "@/lib/auth/account-service";
import { getNeonAuthServer } from "@/lib/auth/neon-server";
import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";
import { resolveLegacyAuthRequest, resolveNeonAuthRequest } from "@/lib/auth/request-context";
import { readNeonAuthFoundation } from "@/lib/auth/neon-auth-foundation";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { createIdentityToken, IDENTITY_HEADER } from "@/lib/auth/identity-token";
import { decodeJsonBase64Url, encodeJsonBase64Url } from "@/lib/auth/hmac";
import { apiLogger } from "@/lib/logger";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import { createAuthContext } from "@/lib/contracts";

jest.mock("@/lib/auth/neon-server", () => ({ getNeonAuthServer: jest.fn() }));
jest.mock("@/lib/auth/repository-runtime", () => ({ getAuthRepositoryPort: jest.fn() }));
jest.mock("@/lib/auth/request-context", () => ({
  resolveLegacyAuthRequest: jest.fn(),
  resolveNeonAuthRequest: jest.fn(),
}));
jest.mock("@/lib/auth/neon-auth-foundation", () => ({ readNeonAuthFoundation: jest.fn() }));
jest.mock("@/lib/auth/environment", () => ({ readAuthEnvironment: jest.fn() }));
jest.mock("@/lib/logger", () => ({ apiLogger: { warn: jest.fn() } }));

const mockedGetServer = jest.mocked(getNeonAuthServer);
const mockedGetRepositories = jest.mocked(getAuthRepositoryPort);
const mockedResolveNeon = jest.mocked(resolveNeonAuthRequest);
const mockedResolveLegacy = jest.mocked(resolveLegacyAuthRequest);
const mockedFoundation = jest.mocked(readNeonAuthFoundation);
const mockedEnvironment = jest.mocked(readAuthEnvironment);
const mockedWarn = jest.mocked(apiLogger.warn);

const provider = { getSession: jest.fn() };
const repositories = {} as AuthRepositoryPort;
const identityTokenSecret = "neon-cookie-secret-that-is-at-least-thirty-two-bytes";
const sessionId = "40000000-0000-4000-8000-000000000004";
const context = createAuthContext({
  userId: "20000000-0000-4000-8000-000000000002",
  actorKind: "user",
  actorId: "20000000-0000-4000-8000-000000000002",
  requestId: "30000000-0000-4000-8000-000000000003",
});
const resolved = { context } as Awaited<ReturnType<typeof resolveNeonAuthRequest>>;

function handoff(overrides: Partial<Parameters<typeof createIdentityToken>[0]> = {}, now?: Date) {
  return createIdentityToken(
    {
      userId: context.userId,
      actorKind: "user",
      sessionId,
      fresh: true,
      traceId: context.requestId,
      ...overrides,
    },
    identityTokenSecret,
    now
  );
}

function requestWith(headers: Record<string, string>) {
  return new Request("https://distil.example/api/v1/feed", { headers });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetServer.mockReturnValue(provider as never);
  mockedGetRepositories.mockResolvedValue(repositories);
  mockedResolveNeon.mockResolvedValue(resolved);
  mockedResolveLegacy.mockResolvedValue(context);
  mockedFoundation.mockReturnValue({ enabled: true, status: "ready", missing: [] });
  mockedEnvironment.mockReturnValue({
    sessionSecret: "a-secure-session-secret-that-is-long-enough",
    identityTokenSecret,
  } as ReturnType<typeof readAuthEnvironment>);
});

describe("account service composition", () => {
  it("uses explicit dependencies and propagates a valid trace id", async () => {
    const request = new Request("https://distil.example/account", {
      headers: { "x-trace-id": context.requestId },
    });
    await expect(resolveCurrentAccount(request, { provider, repositories })).resolves.toBe(
      resolved
    );
    expect(mockedGetServer).not.toHaveBeenCalled();
    expect(mockedGetRepositories).not.toHaveBeenCalled();
    expect(mockedResolveNeon).toHaveBeenCalledWith(
      expect.objectContaining({ getSession: expect.any(Function) }),
      repositories,
      context.requestId
    );
    // The provider is wrapped only to count calls; every lookup still reaches it.
    const counted = mockedResolveNeon.mock.calls[0][0];
    await counted.getSession({ query: { disableCookieCache: "true" } });
    expect(provider.getSession).toHaveBeenCalledWith({ query: { disableCookieCache: "true" } });
  });

  it("loads default runtime dependencies and tolerates a missing trace id", async () => {
    await resolveCurrentAccount(new Request("https://distil.example/account"));
    expect(mockedGetServer).toHaveBeenCalledTimes(1);
    expect(mockedGetRepositories).toHaveBeenCalledTimes(1);
    expect(mockedResolveNeon).toHaveBeenCalledWith(
      expect.objectContaining({ getSession: expect.any(Function) }),
      repositories,
      undefined
    );
  });

  it("returns the locked Neon context when the provider rollout is enabled", async () => {
    await expect(
      resolveRequestAuthContext(
        new Request("https://distil.example", {
          headers: { "x-trace-id": context.requestId },
        }),
        { provider, repositories }
      )
    ).resolves.toBe(context);
    expect(mockedResolveLegacy).not.toHaveBeenCalled();
  });

  it("uses the legacy session boundary when Neon Auth is disabled", async () => {
    mockedFoundation.mockReturnValue({ enabled: false, status: "disabled", missing: [] });
    const previousUser = process.env.DISTIL_LEGACY_USER_ID;
    process.env.DISTIL_LEGACY_USER_ID = context.userId;
    try {
      const request = new Request("https://distil.example");
      await expect(resolveRequestAuthContext(request)).resolves.toBe(context);
      expect(mockedResolveLegacy).toHaveBeenCalledWith(request, {
        sessionSecret: "a-secure-session-secret-that-is-long-enough",
        legacyUserId: context.userId,
        requestId: undefined,
      });
    } finally {
      if (previousUser === undefined) delete process.env.DISTIL_LEGACY_USER_ID;
      else process.env.DISTIL_LEGACY_USER_ID = previousUser;
    }
  });

  it("passes an empty legacy id and an explicit trace id without reading Neon dependencies", async () => {
    mockedFoundation.mockReturnValue({ enabled: false, status: "disabled", missing: [] });
    const previousUser = process.env.DISTIL_LEGACY_USER_ID;
    delete process.env.DISTIL_LEGACY_USER_ID;
    try {
      const request = new Request("https://distil.example", {
        headers: { "x-trace-id": context.requestId },
      });
      await resolveRequestAuthContext(request);
      expect(mockedResolveLegacy).toHaveBeenCalledWith(request, {
        sessionSecret: "a-secure-session-secret-that-is-long-enough",
        legacyUserId: "",
        requestId: context.requestId,
      });
      expect(mockedGetServer).not.toHaveBeenCalled();
    } finally {
      if (previousUser === undefined) delete process.env.DISTIL_LEGACY_USER_ID;
      else process.env.DISTIL_LEGACY_USER_ID = previousUser;
    }
  });
});

describe("proxy identity handoff in the account service", () => {
  it("accepts the proxy's token for this trace id with zero provider or database work", async () => {
    const request = requestWith({
      "x-trace-id": context.requestId,
      [IDENTITY_HEADER]: await handoff(),
    });
    await expect(resolveRequestAuthContext(request)).resolves.toEqual({
      ...context,
      sessionId,
    });
    expect(mockedGetServer).not.toHaveBeenCalled();
    expect(mockedGetRepositories).not.toHaveBeenCalled();
    expect(mockedResolveNeon).not.toHaveBeenCalled();
    expect(mockedResolveLegacy).not.toHaveBeenCalled();
    expect(mockedWarn).not.toHaveBeenCalled();
  });

  it("falls back to full resolution when no token is present, without logging", async () => {
    await expect(
      resolveRequestAuthContext(requestWith({ "x-trace-id": context.requestId }))
    ).resolves.toBe(context);
    expect(mockedResolveNeon).toHaveBeenCalledTimes(1);
    expect(mockedWarn).not.toHaveBeenCalled();
  });

  it.each([
    [
      "tampered",
      async () => {
        const token = await handoff();
        const [header, payload, signature] = token.split(".");
        const claims = decodeJsonBase64Url(payload) as Record<string, unknown>;
        const forged = encodeJsonBase64Url({
          ...claims,
          sub: "20000000-0000-4000-8000-0000000000ff",
        });
        return `${header}.${forged}.${signature}`;
      },
      "signature",
    ],
    ["expired", () => handoff({}, new Date(Date.now() - 10 * 60 * 1000)), "expired"],
    [
      "jti mismatch",
      () => handoff({ traceId: "30000000-0000-4000-8000-000000000099" }),
      "trace_mismatch",
    ],
    ["not a token", async () => "not-a-token", "malformed"],
  ])(
    "treats a %s token as absent, resolves in full and logs auth_handoff_rejected",
    async (_label, token, code) => {
      const request = requestWith({
        "x-trace-id": context.requestId,
        [IDENTITY_HEADER]: await token(),
      });
      await expect(resolveRequestAuthContext(request)).resolves.toBe(context);
      expect(mockedResolveNeon).toHaveBeenCalledTimes(1);
      expect(mockedWarn).toHaveBeenCalledTimes(1);
      expect(mockedWarn).toHaveBeenCalledWith(
        { event: "auth_handoff_rejected", code, traceId: context.requestId },
        expect.any(String)
      );
      // The token itself never reaches the log.
      expect(JSON.stringify(mockedWarn.mock.calls[0])).not.toContain(await token());
    }
  );

  it("rejects a token whose trace id header is missing", async () => {
    const request = requestWith({ [IDENTITY_HEADER]: await handoff() });
    await expect(resolveRequestAuthContext(request)).resolves.toBe(context);
    expect(mockedWarn).toHaveBeenCalledWith(
      { event: "auth_handoff_rejected", code: "trace_mismatch", traceId: undefined },
      expect.any(String)
    );
  });

  it("falls back when the configured secret cannot verify tokens", async () => {
    mockedEnvironment.mockReturnValue({
      sessionSecret: "a-secure-session-secret-that-is-long-enough",
      identityTokenSecret: "",
    } as ReturnType<typeof readAuthEnvironment>);
    const request = requestWith({
      "x-trace-id": context.requestId,
      [IDENTITY_HEADER]: await handoff(),
    });
    await expect(resolveRequestAuthContext(request)).resolves.toBe(context);
    expect(mockedWarn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "auth_handoff_rejected", code: "unverifiable" }),
      expect.any(String)
    );
  });

  it("only hands off user actors", async () => {
    const request = requestWith({
      "x-trace-id": context.requestId,
      [IDENTITY_HEADER]: await handoff({ actorKind: "system" }),
    });
    await expect(resolveRequestAuthContext(request)).resolves.toBe(context);
    expect(mockedWarn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "auth_handoff_rejected", code: "claims" }),
      expect.any(String)
    );
  });
});
