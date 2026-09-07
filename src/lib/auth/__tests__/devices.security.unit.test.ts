import { listAuthDevices, revokeAuthDevice, revokeOtherAuthDevices } from "@/lib/auth/devices";
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
        createdAt: new Date("2026-09-02T00:00:00Z"),
        updatedAt: new Date("2026-09-02T00:00:00Z"),
        expiresAt: new Date("2026-10-02T00:00:00Z"),
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
  });

  it("resolves a device id server-side and refuses to revoke the current session", async () => {
    const sessions = provider();
    await expect(revokeAuthDevice(sessions, "current", "current")).resolves.toBe(false);
    expect(sessions.revokeSession).not.toHaveBeenCalled();
    await expect(revokeAuthDevice(sessions, "other", "current")).resolves.toBe(true);
    expect(sessions.revokeSession).toHaveBeenCalledWith("secret-other-token");
  });

  it("supports revoking every other device", async () => {
    const sessions = provider();
    await expect(revokeOtherAuthDevices(sessions)).resolves.toBe(true);
    expect(sessions.revokeOtherSessions).toHaveBeenCalledTimes(1);
  });
});
