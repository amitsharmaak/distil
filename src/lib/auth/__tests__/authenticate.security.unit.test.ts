import {
  AuthError,
  authenticateCaptureToken,
  resolveCapturePrincipal,
  verifyLegacyCaptureToken,
} from "@/lib/auth";
import { hashCaptureToken } from "@/lib/auth/capture-tokens";
import { AccessDeniedError } from "@/lib/auth/account";
import { createAuthContext } from "@/lib/contracts/tenant-context";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import type { CaptureTokenRepository, RateLimitRepository } from "@/lib/repositories/ports";

const now = new Date("2026-03-01T00:00:00Z");
const token = `dst_cap_${"a".repeat(43)}`;
const userId = "10000000-0000-4000-8000-000000000010";
const tokenId = "10000000-0000-4000-8000-000000000020";
const sessionContext = createAuthContext({
  userId,
  actorKind: "user",
  actorId: userId,
  requestId: "10000000-0000-4000-8000-000000000030",
});

function dependencies() {
  const captureTokens: jest.Mocked<CaptureTokenRepository> = {
    create: jest.fn(),
    findActiveByHash: jest.fn().mockResolvedValue({
      userId: sessionContext.userId,
      id: tokenId,
      name: "iPhone",
      tokenHash: hashCaptureToken(token),
      tokenPrefix: "dst_cap_aaaaaaaa",
      createdAt: now.toISOString(),
    }),
    list: jest.fn(),
    revoke: jest.fn(),
    touchLastUsed: jest.fn().mockResolvedValue(undefined),
  };
  const rateLimits: jest.Mocked<RateLimitRepository> = {
    consume: jest.fn().mockResolvedValue({
      allowed: true,
      remaining: 59,
      resetAt: "2026-03-01T00:01:00Z",
    }),
  };
  const repositories = { captureTokens, rateLimits } as never;
  return {
    captureTokens,
    rateLimits,
    tokenIdentities: {
      resolveActiveByHash: jest.fn().mockResolvedValue({
        userId: sessionContext.userId,
        tokenId,
      }),
    },
    getTenantRepositories: jest.fn().mockResolvedValue(repositories),
    resolveSessionContext: jest.fn().mockRejectedValue(new AccessDeniedError("unauthenticated")),
  };
}

describe("capture authentication", () => {
  it("exposes the frozen authentication error contract", () => {
    expect(new AuthError("UNAUTHORIZED", 401, "denied")).toMatchObject({
      name: "AuthError",
      code: "UNAUTHORIZED",
      status: 401,
    });
  });

  it("authenticates an active token, rate limits by token id, and updates last use", async () => {
    const deps = dependencies();
    const request = new Request("https://distil.example/api/v1/captures", {
      headers: { authorization: `Bearer ${token}` },
    });
    await expect(authenticateCaptureToken(request, deps, now)).resolves.toEqual({
      kind: "capture-token",
      context: expect.objectContaining({
        userId: sessionContext.userId,
        actorKind: "capture-token",
        actorId: tokenId,
      }),
      userId: sessionContext.userId,
      tokenId,
    });
    expect(deps.captureTokens.findActiveByHash).toHaveBeenCalledWith(hashCaptureToken(token));
    expect(deps.rateLimits.consume).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: sessionContext.userId,
        principalId: tokenId,
        key: `capture-token:${tokenId}`,
        limit: 60,
        windowSeconds: 60,
      })
    );
    expect(deps.captureTokens.touchLastUsed).toHaveBeenCalledWith(tokenId, now.toISOString());
  });

  it("rejects malformed and revoked tokens without consuming a rate window", async () => {
    const deps = dependencies();
    deps.tokenIdentities.resolveActiveByHash.mockResolvedValue(undefined);
    await expect(
      authenticateCaptureToken(
        new Request("https://distil.example", { headers: { authorization: `Bearer ${token}` } }),
        deps,
        now
      )
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(deps.rateLimits.consume).not.toHaveBeenCalled();

    await expect(
      authenticateCaptureToken(
        new Request("https://distil.example", { headers: { authorization: "Basic abc" } }),
        deps,
        now
      )
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await expect(
      authenticateCaptureToken(new Request("https://distil.example"), deps, now)
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects the sixty-first capture and does not update last use", async () => {
    const deps = dependencies();
    deps.rateLimits.consume.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: "2026-03-01T00:01:00Z",
    });
    await expect(
      authenticateCaptureToken(
        new Request("https://distil.example", { headers: { authorization: `Bearer ${token}` } }),
        deps,
        now
      )
    ).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
    expect(deps.captureTokens.touchLastUsed).not.toHaveBeenCalled();
  });

  it("resolves a session without applying capture-token rate limits", async () => {
    const deps = dependencies();
    deps.resolveSessionContext.mockResolvedValue(sessionContext);
    const request = new Request("https://distil.example");
    await expect(resolveCapturePrincipal(request, deps, now)).resolves.toEqual({
      kind: "session",
      context: sessionContext,
    });
    expect(deps.captureTokens.findActiveByHash).not.toHaveBeenCalled();
    expect(deps.rateLimits.consume).not.toHaveBeenCalled();
  });

  it("prefers an explicitly supplied bearer credential over a session", async () => {
    const deps = dependencies();
    deps.tokenIdentities.resolveActiveByHash.mockResolvedValue(undefined);
    const request = new Request("https://distil.example", {
      headers: { authorization: "Bearer invalid" },
    });
    await expect(resolveCapturePrincipal(request, deps, now)).resolves.toBeUndefined();
  });

  it("propagates non-credential failures while resolving bearer principals", async () => {
    const deps = dependencies();
    deps.rateLimits.consume.mockRejectedValue(new Error("rate-limit storage unavailable"));
    await expect(
      resolveCapturePrincipal(
        new Request("https://distil.example", {
          headers: { authorization: `Bearer ${token}` },
        }),
        deps,
        now
      )
    ).rejects.toThrow("rate-limit storage unavailable");
  });

  it("returns no principal for a request without credentials", async () => {
    await expect(
      resolveCapturePrincipal(new Request("https://distil.example"), dependencies(), now)
    ).resolves.toBeUndefined();
  });

  it("propagates session storage failures", async () => {
    const deps = dependencies();
    deps.resolveSessionContext.mockRejectedValue(new Error("session storage unavailable"));
    await expect(
      resolveCapturePrincipal(new Request("https://distil.example"), deps, now)
    ).rejects.toThrow("session storage unavailable");
  });

  it("uses the current time when rate-limit callers omit it", async () => {
    const repository = dependencies().rateLimits;
    await expect(
      enforceRateLimit(repository, { key: "default-clock", limit: 1, windowSeconds: 60 })
    ).resolves.toBeUndefined();
    expect(repository.consume).toHaveBeenCalledWith(
      expect.objectContaining({ key: "default-clock", now: expect.any(String) })
    );
  });

  it("keeps the legacy token behind an explicit compatibility helper", () => {
    const request = new Request("https://distil.example", {
      headers: { authorization: "Bearer old-secret" },
    });
    expect(verifyLegacyCaptureToken(request, "old-secret")).toBe(true);
    expect(verifyLegacyCaptureToken(request, "wrong-secret")).toBe(false);
    expect(verifyLegacyCaptureToken(request)).toBe(false);
    expect(
      verifyLegacyCaptureToken(
        new Request("https://distil.example", { headers: { authorization: "Basic old-secret" } }),
        "old-secret"
      )
    ).toBe(false);
    expect(verifyLegacyCaptureToken(new Request("https://distil.example"), "old-secret")).toBe(
      false
    );
  });
});
