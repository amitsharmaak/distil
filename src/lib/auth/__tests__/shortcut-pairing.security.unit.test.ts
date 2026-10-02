import type { Sql } from "postgres";
import { hashCaptureToken } from "@/lib/auth/capture-tokens";
import { AuthError } from "@/lib/auth/errors";
import { PostgresShortcutPairingIdentityResolver } from "@/lib/auth/shortcut-pairing-identity";
import {
  createPairingCode,
  exchangePairingCode,
  normalizePairingCode,
} from "@/lib/auth/shortcut-pairing";
import { createAuthContext } from "@/lib/contracts/tenant-context";
import type { ShortcutPairingRepository } from "@/lib/repositories/ports";

const context = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000010",
  actorKind: "user",
  actorId: "10000000-0000-4000-8000-000000000010",
  requestId: "10000000-0000-4000-8000-000000000011",
});
const pairingId = "10000000-0000-4000-8000-000000000012";
const now = new Date("2026-10-01T09:00:00.000Z");

function repository(): jest.Mocked<ShortcutPairingRepository> {
  return {
    replacePending: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn(),
    exchange: jest.fn().mockResolvedValue(true),
  };
}
function dependencies() {
  const pairings = repository();
  return {
    pairings,
    pairingIdentities: {
      resolveByHash: jest.fn().mockResolvedValue({ pairingId, userId: context.userId }),
    },
    getTenantRepositories: jest.fn().mockResolvedValue({ shortcutPairings: pairings }),
  };
}

describe("iPhone pairing domain", () => {
  it("issues eight Crockford characters from exactly 40 bits and stores only their hash for ten minutes", async () => {
    const repo = repository();
    const issued = await createPairingCode(context, repo, {
      now,
      id: pairingId,
      random: Buffer.alloc(5, 255),
    });
    expect(issued).toEqual({ code: "ZZZZ-ZZZZ", expiresAt: "2026-10-01T09:10:00.000Z" });
    expect(repo.replacePending).toHaveBeenCalledWith({
      id: pairingId,
      userId: context.userId,
      codeHash: hashCaptureToken("ZZZZZZZZ"),
      createdAt: now.toISOString(),
      expiresAt: issued.expiresAt,
      attempts: 0,
    });
    expect(JSON.stringify(repo.replacePending.mock.calls).includes(issued.code)).toBe(false);
    expect(JSON.stringify(repo.replacePending.mock.calls).includes("ZZZZZZZZ")).toBe(false);
    await expect(createPairingCode(context, repo, { random: Buffer.alloc(4) })).rejects.toThrow(
      "40 bits"
    );
  });

  it("uses all five random bytes and normalizes the optional separator and casing", async () => {
    const repo = repository();
    const first = await createPairingCode(context, repo, { random: Buffer.from([0, 0, 0, 0, 0]) });
    const last = await createPairingCode(context, repo, { random: Buffer.from([0, 0, 0, 0, 1]) });
    expect(first.code).not.toBe(last.code);
    expect(normalizePairingCode(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(normalizePairingCode("abcdefgh")).toBe("ABCDEFGH");
    for (const invalid of [
      undefined,
      null,
      1234,
      "",
      "ABC-DEF12",
      "ABCD--EFGH",
      "ABCD EFGH",
      "ABCDEFGI",
      "ABCDEFGU",
      "ABCDEFGLO",
      "ABCDEFGO",
    ]) {
      expect(normalizePairingCode(invalid)).toBeUndefined();
    }
  });

  it("establishes the resolved owner, creates only a hashed phone credential, and returns the secret once", async () => {
    const deps = dependencies();
    const result = await exchangePairingCode(
      { code: "abcd-efgh", deviceName: "  Personal\niPhone  " },
      deps,
      { now, requestId: context.requestId }
    );
    expect(Object.keys(result)).toEqual(["token"]);
    expect(result.token.startsWith("dst_cap_")).toBe(true);
    expect(deps.pairingIdentities.resolveByHash).toHaveBeenCalledWith(hashCaptureToken("ABCDEFGH"));
    expect(deps.getTenantRepositories).toHaveBeenCalledWith({
      userId: context.userId,
      actorKind: "system",
      actorId: pairingId,
      requestId: context.requestId,
    });
    expect(deps.pairings.findById).not.toHaveBeenCalled();
    expect(deps.pairings.exchange).toHaveBeenCalledWith({
      id: pairingId,
      codeHash: hashCaptureToken("ABCDEFGH"),
      now: now.toISOString(),
      token: expect.objectContaining({
        userId: context.userId,
        kind: "phone",
        name: "iPhone Shortcut",
        label: "Personal iPhone",
        tokenHash: hashCaptureToken(result.token),
      }),
    });
    expect(JSON.stringify(deps.pairings.exchange.mock.calls).includes(result.token)).toBe(false);
  });

  it("defaults the device name and bounds untrusted labels", async () => {
    const deps = dependencies();
    await exchangePairingCode({ code: "ABCDEFGH" }, deps, { now });
    expect(deps.pairings.exchange.mock.calls[0][0].token.label).toBe("iPhone");
    await exchangePairingCode({ code: "ABCDEFGH", deviceName: "x".repeat(500) }, deps, { now });
    expect(deps.pairings.exchange.mock.calls[1][0].token.label).toHaveLength(80);
  });

  it("gives malformed, unknown, and repository-rejected codes the same error without resolving approximate matches", async () => {
    const malformed = dependencies();
    const unknown = dependencies();
    unknown.pairingIdentities.resolveByHash.mockResolvedValue(undefined);
    const rejected = dependencies();
    rejected.pairings.exchange.mockResolvedValue(false);
    for (const [deps, code] of [
      [malformed, "bad"],
      [unknown, "ABCDEFGH"],
      [rejected, "ABCDEFGH"],
    ] as const) {
      const error = await exchangePairingCode({ code }, deps, { now }).catch(
        (error: unknown) => error
      );
      expect(error).toBeInstanceOf(AuthError);
      expect(error).toMatchObject({
        code: "UNAUTHORIZED",
        status: 401,
        message: "Authentication required",
      });
    }
    expect(malformed.pairingIdentities.resolveByHash).not.toHaveBeenCalled();
    expect(unknown.getTenantRepositories).not.toHaveBeenCalled();
    expect(rejected.pairings.exchange).toHaveBeenCalledTimes(1);
  });
});

describe("pre-context pairing identity", () => {
  it("calls only the exact-key resolver and exposes opaque identifiers", async () => {
    const sql = jest.fn().mockResolvedValue([{ pairing_id: pairingId, user_id: context.userId }]);
    const resolver = new PostgresShortcutPairingIdentityResolver(sql as unknown as Sql);
    await expect(resolver.resolveByHash("hashed-fixture")).resolves.toEqual({
      pairingId,
      userId: context.userId,
    });
    const [parts, hash] = sql.mock.calls[0];
    expect((parts as TemplateStringsArray).join("?").replace(/\s+/g, " ")).toContain(
      "FROM distil_resolve_shortcut_pairing(?)"
    );
    expect(hash).toBe("hashed-fixture");
    sql.mockResolvedValue([]);
    await expect(resolver.resolveByHash("absent-hash")).resolves.toBeUndefined();
  });
});
