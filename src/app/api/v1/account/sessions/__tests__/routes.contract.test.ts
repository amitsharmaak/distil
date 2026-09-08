jest.mock("@/lib/auth/account-service", () => ({ resolveCurrentAccount: jest.fn() }));
jest.mock("@/lib/auth/devices", () => ({
  neonSessionProvider: jest.fn(),
  listAuthDevices: jest.fn(),
  revokeAuthDevice: jest.fn(),
  revokeOtherAuthDevices: jest.fn(),
}));
jest.mock("@/lib/auth/environment", () => ({
  readAuthEnvironment: () => ({ allowedOrigins: new Set(["https://distil.example"]) }),
}));
jest.mock("@/lib/auth/neon-server", () => ({ getNeonAuthServer: jest.fn() }));
jest.mock("@/lib/auth/origin", () => ({ requireAllowedOrigin: jest.fn() }));
jest.mock("@/lib/auth/request-context", () => ({ requireFreshAuthentication: jest.fn() }));

import { AccessDeniedError } from "@/lib/auth/account";
import { resolveCurrentAccount } from "@/lib/auth/account-service";
import {
  listAuthDevices,
  neonSessionProvider,
  revokeAuthDevice,
  revokeOtherAuthDevices,
} from "@/lib/auth/devices";
import { getNeonAuthServer } from "@/lib/auth/neon-server";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { requireFreshAuthentication } from "@/lib/auth/request-context";
import { DELETE as revokeOne } from "@/app/api/v1/account/sessions/[id]/route";
import { POST as revokeOthers } from "@/app/api/v1/account/sessions/revoke-others/route";
import { GET as listSessions } from "@/app/api/v1/account/sessions/route";

const provider = {};
const server = {};
const freshAuth = {
  authenticatedAt: "2026-09-08T00:00:00.000Z",
  freshUntil: "2026-09-08T00:10:00.000Z",
  isFresh: true,
};
const resolved = {
  identity: { sessionId: "current-session" },
  freshAuth,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(resolveCurrentAccount).mockResolvedValue(resolved as never);
  jest.mocked(getNeonAuthServer).mockReturnValue(server as never);
  jest.mocked(neonSessionProvider).mockReturnValue(provider as never);
  jest.mocked(listAuthDevices).mockResolvedValue([
    {
      id: "current-session",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-08T00:00:00.000Z",
      expiresAt: "2026-10-01T00:00:00.000Z",
      current: true,
    },
  ]);
  jest.mocked(revokeAuthDevice).mockResolvedValue(true);
  jest.mocked(revokeOtherAuthDevices).mockResolvedValue(true);
});

describe("account session routes", () => {
  it("lists only provider sessions relative to the current session", async () => {
    const request = new Request("https://distil.example/api/v1/account/sessions");
    const response = await listSessions(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(resolveCurrentAccount).toHaveBeenCalledWith(request);
    expect(neonSessionProvider).toHaveBeenCalledWith(server);
    expect(listAuthDevices).toHaveBeenCalledWith(provider, "current-session");
    await expect(response.json()).resolves.toMatchObject({
      sessions: [{ id: "current-session", current: true }],
    });
  });

  it("returns an unauthorized response when account resolution fails", async () => {
    jest
      .mocked(resolveCurrentAccount)
      .mockRejectedValueOnce(new AccessDeniedError("unauthenticated"));
    const response = await listSessions(
      new Request("https://distil.example/api/v1/account/sessions")
    );
    expect(response.status).toBe(401);
    expect(listAuthDevices).not.toHaveBeenCalled();
  });

  it("requires Origin and fresh authentication before revoking a remote session", async () => {
    const request = new Request("https://distil.example/api/v1/account/sessions/remote", {
      method: "DELETE",
      headers: { origin: "https://distil.example" },
    });
    const response = await revokeOne(request, {
      params: Promise.resolve({ id: "remote-session" }),
    });

    expect(response.status).toBe(204);
    expect(requireAllowedOrigin).toHaveBeenCalledWith(request, new Set(["https://distil.example"]));
    expect(requireFreshAuthentication).toHaveBeenCalledWith(freshAuth);
    expect(revokeAuthDevice).toHaveBeenCalledWith(provider, "remote-session", "current-session");
  });

  it("conceals a missing or current session and maps auth failures", async () => {
    jest.mocked(revokeAuthDevice).mockResolvedValueOnce(false);
    const missing = await revokeOne(
      new Request("https://distil.example/api/v1/account/sessions/missing", { method: "DELETE" }),
      { params: Promise.resolve({ id: "missing" }) }
    );
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");

    jest.mocked(requireFreshAuthentication).mockImplementationOnce(() => {
      throw new AccessDeniedError("unauthenticated");
    });
    const stale = await revokeOne(
      new Request("https://distil.example/api/v1/account/sessions/remote", { method: "DELETE" }),
      { params: Promise.resolve({ id: "remote-session" }) }
    );
    expect(stale.status).toBe(401);
    expect(revokeAuthDevice).toHaveBeenCalledTimes(1);
  });

  it("revokes all other sessions behind Origin and fresh-auth checks", async () => {
    const request = new Request("https://distil.example/api/v1/account/sessions/revoke-others", {
      method: "POST",
      headers: { origin: "https://distil.example" },
    });
    const response = await revokeOthers(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(requireAllowedOrigin).toHaveBeenCalledWith(request, new Set(["https://distil.example"]));
    expect(requireFreshAuthentication).toHaveBeenCalledWith(freshAuth);
    expect(revokeOtherAuthDevices).toHaveBeenCalledWith(provider);
    await expect(response.json()).resolves.toEqual({ revoked: true });
  });

  it("does not call the provider when revoke-others authentication fails", async () => {
    jest.mocked(resolveCurrentAccount).mockRejectedValueOnce(new AccessDeniedError("disabled"));
    const response = await revokeOthers(
      new Request("https://distil.example/api/v1/account/sessions/revoke-others", {
        method: "POST",
      })
    );
    expect(response.status).toBe(403);
    expect(revokeOtherAuthDevices).not.toHaveBeenCalled();
  });
});
