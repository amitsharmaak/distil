jest.mock("@/lib/auth/account-service", () => ({ resolveRequestAuthContext: jest.fn() }));
jest.mock("@/lib/database", () => ({
  getTenantRepositories: jest.fn(),
  getShortcutPairingIdentityResolver: jest.fn(),
}));
jest.mock("@/lib/auth/shortcut-pairing", () => ({
  createPairingCode: jest.fn(),
  exchangePairingCode: jest.fn(),
}));
jest.mock("@/lib/auth/shortcut-pairing-rate-limit", () => ({
  enforceShortcutPairingRateLimit: jest.fn(),
}));

import { POST as create } from "../route";
import { POST as exchange } from "../exchange/route";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { AccessDeniedError } from "@/lib/auth/account";
import { AuthError } from "@/lib/auth/errors";
import { createPairingCode, exchangePairingCode } from "@/lib/auth/shortcut-pairing";
import { enforceShortcutPairingRateLimit } from "@/lib/auth/shortcut-pairing-rate-limit";
import { createAuthContext } from "@/lib/contracts";
import { getShortcutPairingIdentityResolver, getTenantRepositories } from "@/lib/database";

const origin = "https://distil.example";
const pairingPath = "/api/v1/shortcut-pairings";
const context = createAuthContext({
  userId: "11111111-1111-4111-8111-111111111111",
  actorId: "11111111-1111-4111-8111-111111111111",
  actorKind: "user",
  requestId: "22222222-2222-4222-8222-222222222222",
});
const pairingRepository = { replacePending: jest.fn(), findById: jest.fn(), exchange: jest.fn() };
const identities = { resolveByHash: jest.fn() };

function request(path: string, body?: string, headers?: HeadersInit) {
  return new Request(`${origin}${path}`, { method: "POST", headers, body });
}

beforeEach(() => {
  jest.resetAllMocks();
  process.env.DISTIL_ALLOWED_ORIGINS = origin;
  jest.mocked(resolveRequestAuthContext).mockImplementation(async (req) => {
    if (!req.headers.get("cookie")) throw new AccessDeniedError("unauthenticated");
    return context;
  });
  jest
    .mocked(getTenantRepositories)
    .mockResolvedValue({ shortcutPairings: pairingRepository } as never);
  jest.mocked(getShortcutPairingIdentityResolver).mockResolvedValue(identities);
  jest
    .mocked(createPairingCode)
    .mockResolvedValue({ code: "TEST-CODE", expiresAt: "2026-10-01T00:10:00Z" });
  jest.mocked(exchangePairingCode).mockResolvedValue({ token: "test-issued-token" });
  jest.mocked(enforceShortcutPairingRateLimit).mockResolvedValue(undefined);
});

afterAll(() => {
  delete process.env.DISTIL_ALLOWED_ORIGINS;
});

describe("POST shortcut-pairings", () => {
  it("requires a session before loading the tenant or creating a code", async () => {
    const response = await create(request(pairingPath, undefined, { origin }));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getTenantRepositories).not.toHaveBeenCalled();
    expect(createPairingCode).not.toHaveBeenCalled();
  });

  it.each([undefined, "https://hostile.example"])(
    "rejects missing or hostile origins",
    async (suppliedOrigin) => {
      const response = await create(
        request(pairingPath, undefined, {
          cookie: "session=present",
          ...(suppliedOrigin ? { origin: suppliedOrigin } : {}),
        })
      );
      expect(response.status).toBe(403);
      expect(resolveRequestAuthContext).not.toHaveBeenCalled();
      expect(createPairingCode).not.toHaveBeenCalled();
    }
  );

  it("returns the one-time code privately for the verified session owner", async () => {
    const response = await create(
      request(pairingPath, undefined, { origin, cookie: "session=present" })
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      code: "TEST-CODE",
      expiresAt: "2026-10-01T00:10:00Z",
    });
    expect(getTenantRepositories).toHaveBeenCalledWith(context);
    expect(createPairingCode).toHaveBeenCalledWith(context, pairingRepository);
  });
});

describe("POST shortcut-pairings/exchange", () => {
  it("requires no session or origin and returns only the token with no-store", async () => {
    const req = request(
      `${pairingPath}/exchange`,
      JSON.stringify({ code: "TEST-CODE", deviceName: "Personal iPhone" })
    );
    const response = await exchange(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ token: "test-issued-token" });
    expect(resolveRequestAuthContext).not.toHaveBeenCalled();
    expect(enforceShortcutPairingRateLimit).toHaveBeenCalledWith(req);
    expect(exchangePairingCode).toHaveBeenCalledWith(
      { code: "TEST-CODE", deviceName: "Personal iPhone" },
      { pairingIdentities: identities, getTenantRepositories },
      { requestId: expect.any(String) }
    );
    expect(jest.mocked(enforceShortcutPairingRateLimit).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(getShortcutPairingIdentityResolver).mock.invocationCallOrder[0]
    );
  });

  it.each(["unknown", "expired", "consumed"])(
    "conceals %s codes behind the same response",
    async (reason) => {
      jest
        .mocked(exchangePairingCode)
        .mockRejectedValue(new AuthError("UNAUTHORIZED", 401, reason));
      const response = await exchange(
        request(`${pairingPath}/exchange`, JSON.stringify({ code: "TEST-CODE" }))
      );
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      await expect(response.json()).resolves.toEqual({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      expect(enforceShortcutPairingRateLimit).toHaveBeenCalledTimes(1);
    }
  );

  it.each(["not-json", "null", "[]", '"scalar"'])(
    "counts malformed body %s before rejecting with no hint",
    async (body) => {
      const response = await exchange(request(`${pairingPath}/exchange`, body));
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      expect(enforceShortcutPairingRateLimit).toHaveBeenCalledTimes(1);
      expect(getShortcutPairingIdentityResolver).not.toHaveBeenCalled();
      expect(exchangePairingCode).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, "session=present"])(
    "rate-limits before parsing even when a session accompanies the attempt",
    async (cookie) => {
      jest
        .mocked(enforceShortcutPairingRateLimit)
        .mockRejectedValue(new AuthError("RATE_LIMITED", 429, "Rate limit exceeded"));
      const req = request(`${pairingPath}/exchange`, "not-json", cookie ? { cookie } : {});
      const parse = jest.spyOn(req, "json");
      const response = await exchange(req);
      expect(response.status).toBe(429);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(parse).not.toHaveBeenCalled();
      expect(getShortcutPairingIdentityResolver).not.toHaveBeenCalled();
      expect(exchangePairingCode).not.toHaveBeenCalled();
    }
  );

  it("fails closed and conceals infrastructure details when rate limiting fails", async () => {
    jest
      .mocked(enforceShortcutPairingRateLimit)
      .mockRejectedValue(new Error("private storage detail"));
    const response = await exchange(
      request(`${pairingPath}/exchange`, JSON.stringify({ code: "TEST-CODE" }))
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: { code: "PROCESSING_FAILED", message: "The request could not be completed" },
    });
    expect(exchangePairingCode).not.toHaveBeenCalled();
  });
});
