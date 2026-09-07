import {
  listAuthDevices,
  neonSessionProvider,
  revokeAuthDevice,
  revokeOtherAuthDevices,
} from "@/lib/auth/devices";
import type { ProviderSessionPort } from "@/lib/auth/ports";

function provider(): jest.Mocked<ProviderSessionPort> {
  return {
    listSessions: jest.fn().mockResolvedValue([
      {
        id: "current",
        token: "secret-current-token",
        createdAt: new Date("2026-09-01T00:00:00Z"),
        updatedAt: new Date("2026-09-01T00:00:00Z"),
        expiresAt: new Date("2026-10-01T00:00:00Z"),
        userAgent: "Mobile Safari",
      },
      {
        id: "other",
        token: "secret-other-token",
        createdAt: "2026-09-02T00:00:00Z" as unknown as Date,
        updatedAt: "2026-09-02T00:00:00Z" as unknown as Date,
        expiresAt: "2026-10-02T00:00:00Z" as unknown as Date,
        ipAddress: "203.0.113.7",
      },
    ]),
    revokeSession: jest.fn().mockResolvedValue(true),
    revokeAllSessions: jest.fn().mockResolvedValue(true),
    revokeOtherSessions: jest.fn().mockResolvedValue(true),
  };
}

describe("session/device helpers", () => {
  it("never exposes provider session tokens", async () => {
    const devices = await listAuthDevices(provider(), "current");
    expect(devices).toHaveLength(2);
    expect(devices[0].current).toBe(true);
    expect(JSON.stringify(devices)).not.toContain("secret-");
    expect(devices[0]).not.toHaveProperty("token");
    expect(devices[1]).toMatchObject({
      createdAt: "2026-09-02T00:00:00.000Z",
      ipAddress: "203.0.113.7",
      current: false,
    });
  });

  it("resolves a device id server-side and refuses to revoke the current session", async () => {
    const sessions = provider();
    await expect(revokeAuthDevice(sessions, "current", "current")).resolves.toBe(false);
    expect(sessions.revokeSession).not.toHaveBeenCalled();
    await expect(revokeAuthDevice(sessions, "other", "current")).resolves.toBe(true);
    expect(sessions.revokeSession).toHaveBeenCalledWith("secret-other-token");

    await expect(revokeAuthDevice(sessions, "missing", "current")).resolves.toBe(false);
  });

  it("supports revoking every other device", async () => {
    const sessions = provider();
    await expect(revokeOtherAuthDevices(sessions)).resolves.toBe(true);
    expect(sessions.revokeOtherSessions).toHaveBeenCalledTimes(1);
  });

  it("adapts successful Neon session operations without leaking provider response shapes", async () => {
    const listed = await provider().listSessions();
    const auth = {
      listSessions: jest.fn().mockResolvedValue({ data: listed, error: null }),
      revokeSession: jest.fn().mockResolvedValue({ data: { status: true }, error: null }),
      revokeSessions: jest.fn().mockResolvedValue({ data: { status: true }, error: null }),
      revokeOtherSessions: jest.fn().mockResolvedValue({ data: { status: true }, error: null }),
    };
    const adapter = neonSessionProvider(auth);
    await expect(adapter.listSessions()).resolves.toBe(listed);
    await expect(adapter.revokeSession("provider-token")).resolves.toBe(true);
    await expect(adapter.revokeAllSessions()).resolves.toBe(true);
    await expect(adapter.revokeOtherSessions()).resolves.toBe(true);
    expect(auth.revokeSession).toHaveBeenCalledWith({ token: "provider-token" });
  });

  it.each([
    ["revokeSession", "revokeSession"],
    ["revokeAllSessions", "revokeSessions"],
    ["revokeOtherSessions", "revokeOtherSessions"],
  ] as const)(
    "returns false when %s reports an error or missing status",
    async (method, sdkMethod) => {
      const auth = {
        listSessions: jest.fn().mockResolvedValue({ data: [], error: null }),
        revokeSession: jest.fn().mockResolvedValue({ data: null, error: new Error("denied") }),
        revokeSessions: jest.fn().mockResolvedValue({ data: {}, error: null }),
        revokeOtherSessions: jest.fn().mockResolvedValue({ data: { status: false }, error: null }),
      };
      const adapter = neonSessionProvider(auth as never);
      await expect(
        method === "revokeSession" ? adapter[method]("token") : adapter[method]()
      ).resolves.toBe(false);
      expect(auth[sdkMethod]).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    { data: null, error: null },
    { data: [], error: new Error("provider unavailable") },
  ])("fails closed when Neon cannot list sessions (%j)", async (result) => {
    const adapter = neonSessionProvider({
      listSessions: jest.fn().mockResolvedValue(result),
      revokeSession: jest.fn(),
      revokeSessions: jest.fn(),
      revokeOtherSessions: jest.fn(),
    });
    await expect(adapter.listSessions()).rejects.toThrow("Unable to list sessions");
  });
});
