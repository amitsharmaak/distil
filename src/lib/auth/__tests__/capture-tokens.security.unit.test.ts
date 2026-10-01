import {
  hashCaptureToken,
  issueBrowserConnection,
  issueCaptureToken,
  normalizeBrowserLabel,
  safeTokenEqual,
} from "@/lib/auth/capture-tokens";
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
      kind: "manual",
      createdAt: "2026-03-01T00:00:00.000Z",
    });
    expect(JSON.stringify(repo.replaceActive.mock.calls)).not.toContain(issued.token);
  });

  it("issues a browser connection without revoking anything and stores only its hash", async () => {
    const repo = repository();
    const issued = await issueBrowserConnection(
      context,
      repo,
      { label: "  Chrome\non macOS  " },
      { id: "conn-id", now: new Date("2026-09-30T00:00:00Z"), random: Buffer.alloc(32, 7) }
    );

    expect(issued.token).toMatch(/^dst_cap_[A-Za-z0-9_-]{43}$/);
    expect(issued.connection).toEqual({
      id: "conn-id",
      label: "Chrome on macOS",
      createdAt: "2026-09-30T00:00:00.000Z",
    });
    expect(repo.replaceActive).not.toHaveBeenCalled();
    expect(repo.revoke).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith({
      userId: context.userId,
      id: "conn-id",
      name: "Browser connection",
      tokenHash: hashCaptureToken(issued.token),
      tokenPrefix: issued.token.slice(0, 16),
      kind: "browser",
      label: "Chrome on macOS",
      createdAt: "2026-09-30T00:00:00.000Z",
    });
    expect(JSON.stringify(repo.create.mock.calls)).not.toContain(issued.token);
  });

  it("issues phone tokens independently and retains manual issuance as the default", async () => {
    const repo = repository();
    await issueCaptureToken(context, repo, { kind: "phone", label: "Personal iPhone" });
    expect(repo.replaceActive).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "phone", label: "Personal iPhone", name: "iPhone Shortcut" })
    );
    await issueCaptureToken(context, repo);
    expect(repo.replaceActive).toHaveBeenCalledWith(expect.objectContaining({ kind: "manual" }));
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it("normalizes browser labels to short single-line text", () => {
    expect(normalizeBrowserLabel(undefined)).toBe("Browser");
    expect(normalizeBrowserLabel("   ")).toBe("Browser");
    expect(normalizeBrowserLabel(42)).toBe("Browser");
    expect(normalizeBrowserLabel("a\u0000b\u001fc\td")).toBe("a b c d");
    expect(normalizeBrowserLabel("x".repeat(500))).toHaveLength(80);
  });

  it("compares legacy compatibility secrets without comparing plaintext bytes", () => {
    expect(safeTokenEqual("same", "same")).toBe(true);
    expect(safeTokenEqual("same", "different")).toBe(false);
  });
});
