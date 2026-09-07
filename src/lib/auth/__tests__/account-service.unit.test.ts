import { resolveCurrentAccount, resolveRequestAuthContext } from "@/lib/auth/account-service";
import { getNeonAuthServer } from "@/lib/auth/neon-server";
import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";
import { resolveLegacyAuthRequest, resolveNeonAuthRequest } from "@/lib/auth/request-context";
import { readNeonAuthFoundation } from "@/lib/auth/neon-auth-foundation";
import { readAuthEnvironment } from "@/lib/auth/environment";
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

const mockedGetServer = jest.mocked(getNeonAuthServer);
const mockedGetRepositories = jest.mocked(getAuthRepositoryPort);
const mockedResolveNeon = jest.mocked(resolveNeonAuthRequest);
const mockedResolveLegacy = jest.mocked(resolveLegacyAuthRequest);
const mockedFoundation = jest.mocked(readNeonAuthFoundation);
const mockedEnvironment = jest.mocked(readAuthEnvironment);

const provider = { getSession: jest.fn() };
const repositories = {} as AuthRepositoryPort;
const context = createAuthContext({
  userId: "20000000-0000-4000-8000-000000000002",
  actorKind: "user",
  actorId: "20000000-0000-4000-8000-000000000002",
  requestId: "30000000-0000-4000-8000-000000000003",
});
const resolved = { context } as Awaited<ReturnType<typeof resolveNeonAuthRequest>>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetServer.mockReturnValue(provider as never);
  mockedGetRepositories.mockResolvedValue(repositories);
  mockedResolveNeon.mockResolvedValue(resolved);
  mockedResolveLegacy.mockResolvedValue(context);
  mockedFoundation.mockReturnValue({ enabled: true, status: "ready", missing: [] });
  mockedEnvironment.mockReturnValue({
    sessionSecret: "a-secure-session-secret-that-is-long-enough",
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
    expect(mockedResolveNeon).toHaveBeenCalledWith(provider, repositories, context.requestId);
  });

  it("loads default runtime dependencies and tolerates a missing trace id", async () => {
    await resolveCurrentAccount(new Request("https://distil.example/account"));
    expect(mockedGetServer).toHaveBeenCalledTimes(1);
    expect(mockedGetRepositories).toHaveBeenCalledTimes(1);
    expect(mockedResolveNeon).toHaveBeenCalledWith(provider, repositories, undefined);
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
