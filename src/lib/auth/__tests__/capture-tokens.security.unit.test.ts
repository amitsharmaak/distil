import { hashCaptureToken, issueCaptureToken, safeTokenEqual } from "@/lib/auth/capture-tokens";
import type { CaptureTokenRepository } from "@/lib/repositories/ports";
import { createAuthContext } from "@/lib/contracts/tenant-context";

const userId = "10000000-0000-4000-8000-000000000010";
const context = createAuthContext({
  userId,
  actorKind: "user",
  actorId: userId,
  requestId: "10000000-0000-4000-8000-000000000011",
});

function repository(): jest.Mocked<CaptureTokenRepository> {
  return {
    create: jest.fn().mockResolvedValue(undefined),
    replaceActive: jest.fn().mockResolvedValue(undefined),
    findActiveByHash: jest.fn(),
    list: jest.fn(),
    revoke: jest.fn(),
    touchLastUsed: jest.fn(),
  };
}

describe("capture token issuance", () => {
  it("returns the plaintext once, persists only its hash, and replaces any active token", async () => {
    const repo = repository();
    const issued = await issueCaptureToken(context, repo, {
      id: "token-id",
      now: new Date("2026-03-01T00:00:00Z"),
      random: Buffer.alloc(32, 5),
    });

    expect(issued.token).toMatch(/^dst_cap_[A-Za-z0-9_-]{43}$/);
    expect(issued.name).toBe("Capture token");
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.replaceActive).toHaveBeenCalledWith({
      userId: context.userId,
      id: "token-id",
      name: "Capture token",
      tokenHash: hashCaptureToken(issued.token),
      tokenPrefix: issued.token.slice(0, 16),
      createdAt: "2026-03-01T00:00:00.000Z",
    });
    expect(JSON.stringify(repo.replaceActive.mock.calls)).not.toContain(issued.token);
  });

  it("compares legacy compatibility secrets without comparing plaintext bytes", () => {
    expect(safeTokenEqual("same", "same")).toBe(true);
    expect(safeTokenEqual("same", "different")).toBe(false);
  });
});
