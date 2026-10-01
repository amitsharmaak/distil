import type { Sql } from "postgres";
import { hashCaptureToken } from "@/lib/auth/capture-tokens";
import { createAuthContext } from "@/lib/contracts/tenant-context";
import type { CaptureTokenRecord } from "@/lib/repositories/ports";
import { createPostgresRepositories } from "../repositories";

const context = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000010",
  actorKind: "user",
  actorId: "10000000-0000-4000-8000-000000000010",
  requestId: "10000000-0000-4000-8000-000000000011",
});
const now = "2026-10-01T09:00:00.000Z";
const pairing = {
  user_id: context.userId,
  id: "pairing-id",
  code_hash: hashCaptureToken("ABCDEFGH"),
  created_at: now,
  expires_at: "2026-10-01T09:10:00.000Z",
  attempts: 0,
  consumed_at: null,
  token_id: null,
};
const token: CaptureTokenRecord = {
  userId: context.userId,
  id: "token-id",
  name: "iPhone Shortcut",
  tokenHash: "token-hash",
  tokenPrefix: "dst_cap_prefix",
  kind: "phone",
  label: "iPhone",
  createdAt: now,
};
const input = { id: pairing.id, codeHash: pairing.code_hash, now, token };

function sqlDouble(responses: unknown[][] = []) {
  const queries: Array<{ text: string; values: unknown[]; inTransaction: boolean }> = [];
  let inTransaction = false;
  const sql = jest.fn((parts: TemplateStringsArray, ...values: unknown[]) => {
    const text = parts.join("?").replace(/\s+/g, " ").trim();
    queries.push({ text, values, inTransaction });
    return Promise.resolve(text.includes("pg_advisory_xact_lock") ? [] : (responses.shift() ?? []));
  });
  const begin = jest.fn(async (callback: (transaction: Sql) => Promise<unknown>) => {
    inTransaction = true;
    try {
      return await callback(sql as unknown as Sql);
    } finally {
      inTransaction = false;
    }
  });
  Object.assign(sql, { begin });
  return { sql: sql as unknown as Sql, queries, begin };
}

function repository(fake: ReturnType<typeof sqlDouble>) {
  return createPostgresRepositories(fake.sql, context).shortcutPairings;
}

describe("tenant pairing repository", () => {
  it("serializes code creation and consumes previous pending rows before insert", async () => {
    const fake = sqlDouble();
    await repository(fake).replacePending({
      userId: context.userId,
      id: pairing.id,
      codeHash: pairing.code_hash,
      createdAt: now,
      expiresAt: pairing.expires_at,
      attempts: 0,
    });
    expect(fake.begin).toHaveBeenCalledTimes(1);
    expect(fake.queries.every((query) => query.inTransaction)).toBe(true);
    expect(fake.queries[0].text).toContain("pg_advisory_xact_lock");
    expect(fake.queries[0].values).toEqual(['["shortcut-pairing"]']);
    expect(fake.queries[1].text).toBe(
      "UPDATE shortcut_pairings SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL"
    );
    expect(fake.queries[2].text).toContain("INSERT INTO shortcut_pairings");
    expect(fake.queries[2].values).toEqual([
      context.userId,
      pairing.id,
      pairing.code_hash,
      now,
      pairing.expires_at,
    ]);
  });

  it("locks and rechecks the pairing before inserting the phone and consuming the row in the same transaction", async () => {
    const fake = sqlDouble([[pairing], [], [{ id: pairing.id }]]);
    await expect(repository(fake).exchange(input)).resolves.toBe(true);
    expect(fake.begin).toHaveBeenCalledTimes(1);
    expect(fake.queries.every((query) => query.inTransaction)).toBe(true);
    expect(fake.queries[0].values).toEqual(['["shortcut-pairing"]']);
    expect(fake.queries[1].text).toContain("WHERE user_id=? AND id=? FOR UPDATE");
    expect(fake.queries[2].text).toContain("INSERT INTO capture_tokens");
    expect(fake.queries[2].values).toContain("phone");
    expect(fake.queries[3].text).toContain("SET consumed_at=?,token_id=?");
    expect(fake.queries[3].values).toEqual([now, token.id, context.userId, pairing.id]);
    expect(fake.queries.some(({ text }) => text.includes("SET revoked_at"))).toBe(false);
  });

  it.each([
    undefined,
    { ...pairing, consumed_at: now },
    { ...pairing, expires_at: now },
    { ...pairing, expires_at: "2026-10-01T08:59:59.999Z" },
    { ...pairing, attempts: 5 },
  ])("fails closed for missing, consumed, expired, and exhausted rows", async (row) => {
    const fake = sqlDouble([row ? [row] : []]);
    await expect(repository(fake).exchange(input)).resolves.toBe(false);
    expect(fake.queries).toHaveLength(2);
    expect(fake.queries.some(({ text }) => text.startsWith("INSERT"))).toBe(false);
  });

  it.each([0, 4])(
    "persists a wrong recheck at attempt %i without throwing and consumes at five",
    async (attempts) => {
      const fake = sqlDouble([[{ ...pairing, attempts }]]);
      await expect(repository(fake).exchange({ ...input, codeHash: "wrong-hash" })).resolves.toBe(
        false
      );
      expect(fake.queries[2].text).toContain(
        "UPDATE shortcut_pairings SET attempts=?, consumed_at=?"
      );
      expect(fake.queries[2].values).toEqual([
        attempts + 1,
        attempts === 4 ? now : null,
        context.userId,
        pairing.id,
      ]);
      expect(fake.queries.some(({ text }) => text.includes("INSERT INTO capture_tokens"))).toBe(
        false
      );
    }
  );

  it("rejects mismatched owners, non-phone issuance, and invalid timestamps before any query", async () => {
    const fake = sqlDouble();
    const repo = repository(fake);
    await expect(repo.exchange({ ...input, token: { ...token, kind: "manual" } })).resolves.toBe(
      false
    );
    await expect(repo.exchange({ ...input, now: "invalid" })).resolves.toBe(false);
    await expect(
      repo.exchange({ ...input, token: { ...token, userId: "foreign" as never } })
    ).resolves.toBe(false);
    await expect(
      repo.replacePending({
        userId: "foreign" as never,
        id: pairing.id,
        codeHash: pairing.code_hash,
        createdAt: now,
        expiresAt: pairing.expires_at,
        attempts: 0,
      })
    ).rejects.toThrow("owner");
    expect(fake.queries).toHaveLength(0);
  });

  it("rejects the transaction if consumption unexpectedly fails after inserting a token", async () => {
    const fake = sqlDouble([[pairing], [], []]);
    await expect(repository(fake).exchange(input)).rejects.toThrow("Pairing consumption failed");
    await expect(fake.begin.mock.results[0].value).rejects.toThrow("Pairing consumption failed");
  });

  it("finds only the current tenant's row and refuses context-free access", async () => {
    const fake = sqlDouble([[pairing], []]);
    await expect(repository(fake).findById(pairing.id)).resolves.toMatchObject({
      userId: context.userId,
      id: pairing.id,
      codeHash: pairing.code_hash,
      attempts: 0,
    });
    expect(fake.queries[0].text).toContain("WHERE user_id=? AND id=?");
    await expect(repository(fake).findById("missing")).resolves.toBeUndefined();
    await expect(
      createPostgresRepositories(fake.sql).shortcutPairings.findById(pairing.id)
    ).rejects.toThrow("AuthContext");
  });
});
