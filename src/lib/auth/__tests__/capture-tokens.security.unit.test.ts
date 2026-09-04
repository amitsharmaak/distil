import { hashCaptureToken, issueCaptureToken, safeTokenEqual } from "@/lib/auth/capture-tokens";
import type { CaptureTokenRepository } from "@/lib/repositories/ports";

function repository(): jest.Mocked<CaptureTokenRepository> {
  return {
    create: jest.fn().mockResolvedValue(undefined),
    findActiveByHash: jest.fn(),
    list: jest.fn(),
    revoke: jest.fn(),
    touchLastUsed: jest.fn(),
  };
}

describe("capture token issuance", () => {
  it("returns the plaintext once and persists only its hash", async () => {
    const repo = repository();
    const issued = await issueCaptureToken(repo, " iPhone ", {
      id: "token-id",
      now: new Date("2026-03-01T00:00:00Z"),
      random: Buffer.alloc(32, 5),
    });

    expect(issued.token).toMatch(/^dst_cap_[A-Za-z0-9_-]{43}$/);
    expect(issued.name).toBe("iPhone");
    expect(repo.create).toHaveBeenCalledWith({
      id: "token-id",
      name: "iPhone",
      tokenHash: hashCaptureToken(issued.token),
      tokenPrefix: issued.token.slice(0, 16),
      createdAt: "2026-03-01T00:00:00.000Z",
    });
    expect(JSON.stringify(repo.create.mock.calls)).not.toContain(issued.token);
  });

  it.each(["", "   ", "x".repeat(81)])("rejects invalid token name", async (name) => {
    await expect(issueCaptureToken(repository(), name)).rejects.toThrow(/1-80/);
  });

  it("compares legacy compatibility secrets without comparing plaintext bytes", () => {
    expect(safeTokenEqual("same", "same")).toBe(true);
    expect(safeTokenEqual("same", "different")).toBe(false);
  });
});
