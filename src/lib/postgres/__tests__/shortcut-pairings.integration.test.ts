import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres, { type Sql } from "postgres";

import { PostgresCaptureTokenIdentityResolver } from "@/lib/auth/capture-token-identity";
import {
  hashCaptureToken,
  issueBrowserConnection,
  issueCaptureToken,
  prepareCaptureToken,
} from "@/lib/auth/capture-tokens";
import { createPairingCode, exchangePairingCode } from "@/lib/auth/shortcut-pairing";
import { PostgresShortcutPairingIdentityResolver } from "@/lib/auth/shortcut-pairing-identity";
import { createAuthContext, type AuthContext } from "@/lib/contracts/tenant-context";
import { PostgresTestHarness } from "../../../../tests/support/postgres";
import { PostgresControlPlaneLifecycleRepository } from "../lifecycle-repositories";
import { applyTenantMigrationStage, TENANT_MIGRATION_STAGES } from "../tenant-migration/migrator";
import { buildTenantMigrationReport } from "../tenant-migration/verifier";
import { createPostgresRepositoryAccess, withTenantTransaction } from "../tenant-repositories";

jest.setTimeout(120_000);

const database = new PostgresTestHarness();
const runtimeRole = "distil_shortcut_pairings_test_app";
const runtimePassword = "distil_shortcut_pairings_test_password";
const alpha = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000071",
  actorKind: "user",
  actorId: "10000000-0000-4000-8000-000000000071",
  requestId: "30000000-0000-4000-8000-000000000071",
});
const beta = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000072",
  actorKind: "user",
  actorId: "10000000-0000-4000-8000-000000000072",
  requestId: "30000000-0000-4000-8000-000000000072",
});

let runtimeSql: Sql;
let access: ReturnType<typeof createPostgresRepositoryAccess>;
let pairingIdentities: PostgresShortcutPairingIdentityResolver;
let tokenIdentities: PostgresCaptureTokenIdentityResolver;

const repositories = (context = alpha) => access.getTenantRepositories(context);
const codeHash = (code: string) => hashCaptureToken(code.replace("-", ""));
const dependencies = () => ({
  pairingIdentities,
  getTenantRepositories: (context: AuthContext) => repositories(context),
});

async function createPairing(context = alpha, now = new Date()) {
  const id = randomUUID();
  const issued = await createPairingCode(context, repositories(context).shortcutPairings, {
    id,
    now,
  });
  return { ...issued, id, hash: codeHash(issued.code) };
}

function exchangeInput(id: string, hash: string, context = alpha) {
  const now = new Date();
  return {
    id,
    codeHash: hash,
    now: now.toISOString(),
    token: prepareCaptureToken(context, { kind: "phone", now }).record,
  };
}

function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    release = resolvePromise;
  });
  return { promise, release };
}

// Observe the real database wait instead of inferring concurrency from a sleep.
async function waitForAccountLocks(expected: number) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const [row] = await database.sql<Array<{ count: number }>>`
      SELECT count(*)::integer AS count FROM pg_stat_activity
      WHERE usename=${runtimeRole} AND wait_event_type='Lock'
        AND query LIKE '%FROM users%' AND query LIKE '%FOR UPDATE%'`;
    if (row.count >= expected) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  throw new Error("Expected pairing operations to wait for the account row lock");
}

beforeAll(async () => {
  await database.start();
  await database.migrate(resolve(process.cwd(), "src/lib/postgres/migrations"));
  await database.sql.unsafe("DROP TABLE __distil_test_migrations");
  await database.sql.unsafe(
    await readFile(resolve(process.cwd(), "src/lib/postgres/roles/phase3_roles.sql"), "utf8")
  );
  await applyTenantMigrationStage({ sql: database.sql, stage: "expand", ownerId: alpha.userId });
  const baseline = await buildTenantMigrationReport({
    client: database.sql,
    stage: "before",
    through: "expand",
    ownerId: alpha.userId,
  });
  for (const stage of TENANT_MIGRATION_STAGES.filter((stage) => stage !== "expand")) {
    await applyTenantMigrationStage({
      sql: database.sql,
      stage,
      ownerId: alpha.userId,
      ...(stage === "contract" ? { baseline } : {}),
    });
  }
  await database.sql.unsafe(`
    CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS;
    GRANT distil_runtime TO ${runtimeRole};
  `);
  const uri = new URL(database.connectionUri);
  uri.username = runtimeRole;
  uri.password = runtimePassword;
  runtimeSql = postgres(uri.toString(), { max: 4, prepare: false, onnotice: () => undefined });
  access = createPostgresRepositoryAccess(runtimeSql);
  pairingIdentities = new PostgresShortcutPairingIdentityResolver(runtimeSql);
  tokenIdentities = new PostgresCaptureTokenIdentityResolver(runtimeSql);
});

beforeEach(async () => {
  // Preserve the migration ledgers; owner access is only fixture setup or lock observation.
  await database.sql`DELETE FROM users`;
  await database.sql`
    INSERT INTO users (id, status) VALUES
      (${alpha.userId}::uuid, 'active'), (${beta.userId}::uuid, 'active')`;
});

afterAll(async () => {
  if (runtimeSql) await runtimeSql.end({ timeout: 5 });
  await database.stop();
});

describe("phone pairing through the restricted runtime role", () => {
  it("keeps pairings, token reads, writes and disconnects tenant-bound", async () => {
    const pairing = await createPairing();
    const foreign = repositories(beta);
    await expect(foreign.shortcutPairings.findById(pairing.id)).resolves.toBeUndefined();
    await expect(
      foreign.shortcutPairings.exchange(exchangeInput(pairing.id, pairing.hash, beta))
    ).resolves.toBe(false);
    await expect(
      repositories().shortcutPairings.exchange(exchangeInput(pairing.id, pairing.hash, beta))
    ).resolves.toBe(false);
    await expect(
      withTenantTransaction(runtimeSql, beta, async (sql) => {
        await sql`INSERT INTO shortcut_pairings (user_id,id,code_hash,expires_at,consumed_at)
          VALUES (${alpha.userId}::uuid,'foreign-write','foreign-hash',now() + interval '10 minutes',now())`;
      })
    ).rejects.toThrow(/check option|row-level security/i);
    await expect(repositories().shortcutPairings.findById(pairing.id)).resolves.toMatchObject({
      attempts: 0,
      codeHash: pairing.hash,
    });
    const issued = await exchangePairingCode({ code: pairing.code }, dependencies());
    const token = await repositories().captureTokens.findActiveByHash(
      hashCaptureToken(issued.token)
    );
    expect(token).toMatchObject({ userId: alpha.userId, kind: "phone", label: "iPhone" });
    await expect(
      foreign.captureTokens.findActiveByHash(hashCaptureToken(issued.token))
    ).resolves.toBeUndefined();
    await expect(foreign.captureTokens.list()).resolves.toEqual([]);
    await expect(foreign.captureTokens.revoke(token!.id, new Date().toISOString())).resolves.toBe(
      false
    );
    await expect(
      foreign.captureTokens.revoke("missing-token", new Date().toISOString())
    ).resolves.toBe(false);
    await expect(
      tokenIdentities.resolveActiveByHash(hashCaptureToken(issued.token))
    ).resolves.toMatchObject({
      tokenId: token!.id,
      userId: alpha.userId,
    });
    for (const summary of await repositories().captureTokens.list()) {
      expect(summary).not.toHaveProperty("tokenHash");
      expect(summary).not.toHaveProperty("token");
    }
  });

  it("regenerates manual credentials, adds phones and disconnects one phone independently", async () => {
    const tokens = repositories().captureTokens;
    const originalManual = await issueCaptureToken(alpha, tokens);
    const browser = await issueBrowserConnection(alpha, tokens, { label: "Test browser" });
    const first = await createPairing();
    const firstPhone = await exchangePairingCode(
      { code: first.code, deviceName: "First phone" },
      dependencies()
    );
    const manual = await issueCaptureToken(alpha, tokens);
    await expect(
      tokenIdentities.resolveActiveByHash(hashCaptureToken(originalManual.token))
    ).resolves.toBeUndefined();
    for (const token of [browser.token, firstPhone.token, manual.token]) {
      await expect(
        tokenIdentities.resolveActiveByHash(hashCaptureToken(token))
      ).resolves.toBeDefined();
    }
    const second = await createPairing();
    const secondPhone = await exchangePairingCode(
      { code: second.code, deviceName: "Second phone" },
      dependencies()
    );
    expect((await tokens.list()).filter((token) => !token.revokedAt)).toHaveLength(4);
    const firstRecord = await tokens.findActiveByHash(hashCaptureToken(firstPhone.token));
    await expect(tokens.revoke(firstRecord!.id, new Date().toISOString(), "phone")).resolves.toBe(
      true
    );
    await expect(
      tokenIdentities.resolveActiveByHash(hashCaptureToken(firstPhone.token))
    ).resolves.toBeUndefined();
    for (const token of [browser.token, secondPhone.token, manual.token]) {
      await expect(
        tokenIdentities.resolveActiveByHash(hashCaptureToken(token))
      ).resolves.toBeDefined();
    }
    await expect(
      tokens.revoke(browser.connection.id, new Date().toISOString(), "phone")
    ).resolves.toBe(false);
    await expect(
      tokenIdentities.resolveActiveByHash(hashCaptureToken(browser.token))
    ).resolves.toBeDefined();
  });

  it("returns exactly one plaintext token when two exchanges resolve before either consumes", async () => {
    const pairing = await createPairing();
    const bothResolved = latch();
    let resolved = 0;
    const racingDependencies = {
      ...dependencies(),
      pairingIdentities: {
        async resolveByHash(hash: string) {
          const identity = await pairingIdentities.resolveByHash(hash);
          expect(identity).toBeDefined();
          resolved += 1;
          if (resolved === 2) bothResolved.release();
          await bothResolved.promise;
          return identity;
        },
      },
    };
    const results = await Promise.allSettled([
      exchangePairingCode({ code: pairing.code }, racingDependencies),
      exchangePairingCode({ code: pairing.code }, racingDependencies),
    ]);
    const successes = results.filter((result) => result.status === "fulfilled");
    const failures = results.filter((result) => result.status === "rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    const summaries = await repositories().captureTokens.list("phone");
    expect(summaries).toHaveLength(1);
    const record = await repositories().captureTokens.findActiveByHash(
      hashCaptureToken(successes[0].value.token)
    );
    expect(record?.id).toBe(summaries[0].id);
    expect(await repositories().shortcutPairings.findById(pairing.id)).toMatchObject({
      tokenId: record!.id,
      consumedAt: expect.any(String),
    });
    await expect(pairingIdentities.resolveByHash(pairing.hash)).resolves.toBeUndefined();
  });

  it("serializes replacement so only one of two concurrently created codes remains live", async () => {
    const initial = await createPairing();
    const replacements = await Promise.all([createPairing(), createPairing()]);
    await expect(pairingIdentities.resolveByHash(initial.hash)).resolves.toBeUndefined();
    const identities = await Promise.all(
      replacements.map(({ hash }) => pairingIdentities.resolveByHash(hash))
    );
    expect(identities.filter(Boolean)).toHaveLength(1);
    const rows = await Promise.all(
      replacements.map(({ id }) => repositories().shortcutPairings.findById(id))
    );
    expect(rows.filter((row) => !row?.consumedAt)).toHaveLength(1);
  });

  it("persists failed hash rechecks and consumes the pairing at the five-attempt cap", async () => {
    const pairing = await createPairing();
    for (let attempt = 1; attempt <= 7; attempt += 1) {
      await expect(
        repositories().shortcutPairings.exchange(
          exchangeInput(pairing.id, hashCaptureToken("wrong"))
        )
      ).resolves.toBe(false);
      expect(await repositories().shortcutPairings.findById(pairing.id)).toMatchObject({
        attempts: Math.min(attempt, 5),
      });
    }
    expect(await repositories().shortcutPairings.findById(pairing.id)).toMatchObject({
      consumedAt: expect.any(String),
    });
    await expect(pairingIdentities.resolveByHash(pairing.hash)).resolves.toBeUndefined();
    await expect(
      repositories().shortcutPairings.exchange(exchangeInput(pairing.id, pairing.hash))
    ).resolves.toBe(false);
    await expect(repositories().captureTokens.list()).resolves.toEqual([]);
  });

  it("rejects unknown, replaced, consumed and database-expired codes without issuing tokens", async () => {
    const replaced = await createPairing();
    const current = await createPairing();
    await expect(
      exchangePairingCode({ code: replaced.code }, dependencies())
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      repositories().shortcutPairings.exchange(exchangeInput(replaced.id, replaced.hash))
    ).resolves.toBe(false);
    await exchangePairingCode({ code: current.code }, dependencies());
    await expect(exchangePairingCode({ code: current.code }, dependencies())).rejects.toMatchObject(
      { code: "UNAUTHORIZED" }
    );
    const expired = await createPairing(alpha, new Date(Date.now() - 11 * 60_000));
    await expect(exchangePairingCode({ code: expired.code }, dependencies())).rejects.toMatchObject(
      { code: "UNAUTHORIZED" }
    );
    const staleClockInput = exchangeInput(expired.id, expired.hash);
    staleClockInput.now = new Date(Date.now() - 10 * 60_000).toISOString();
    await expect(repositories().shortcutPairings.exchange(staleClockInput)).resolves.toBe(false);
    await expect(pairingIdentities.resolveByHash(expired.hash.slice(1))).resolves.toBeUndefined();
    await expect(repositories().captureTokens.list()).resolves.toHaveLength(1);
  });

  it("rolls back the inserted token if consuming the pairing fails", async () => {
    const pairing = await createPairing();
    await database.sql.unsafe(`
      CREATE FUNCTION test_reject_pairing_consumption() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN IF NEW.token_id IS NOT NULL THEN RETURN NULL; END IF; RETURN NEW; END $body$;
      CREATE TRIGGER test_reject_pairing_consumption BEFORE UPDATE ON shortcut_pairings
        FOR EACH ROW EXECUTE FUNCTION test_reject_pairing_consumption();
    `);
    try {
      await expect(exchangePairingCode({ code: pairing.code }, dependencies())).rejects.toThrow(
        "Pairing consumption failed"
      );
      await expect(repositories().captureTokens.list()).resolves.toEqual([]);
      const stored = await repositories().shortcutPairings.findById(pairing.id);
      expect(stored?.consumedAt).toBeUndefined();
      expect(stored?.tokenId).toBeUndefined();
      await expect(pairingIdentities.resolveByHash(pairing.hash)).resolves.toMatchObject({
        pairingId: pairing.id,
      });
    } finally {
      await database.sql.unsafe(
        "DROP TRIGGER test_reject_pairing_consumption ON shortcut_pairings; DROP FUNCTION test_reject_pairing_consumption()"
      );
    }
    await expect(exchangePairingCode({ code: pairing.code }, dependencies())).resolves.toEqual({
      token: expect.any(String),
    });
    await expect(repositories().captureTokens.list()).resolves.toHaveLength(1);
  });

  it.each(["suspension", "deletion"] as const)(
    "waits on the account row and denies issuance after concurrent %s commits",
    async (action) => {
      const existing = await issueCaptureToken(alpha, repositories().captureTokens);
      const browser = await issueBrowserConnection(alpha, repositories().captureTokens, {});
      const phonePairing = await createPairing();
      const phone = await exchangePairingCode({ code: phonePairing.code }, dependencies());
      const other = await createPairing(beta);
      const pairing = await createPairing();
      const identityResolved = latch();
      const continueExchange = latch();
      const lifecycleApplied = latch();
      const commitLifecycle = latch();
      const exchange = exchangePairingCode(
        { code: pairing.code },
        {
          ...dependencies(),
          pairingIdentities: {
            async resolveByHash(hash: string) {
              const identity = await pairingIdentities.resolveByHash(hash);
              expect(identity).toBeDefined();
              identityResolved.release();
              await continueExchange.promise;
              return identity;
            },
          },
        }
      ).then(
        () => undefined,
        (error: unknown) => error
      );
      await Promise.race([
        identityResolved.promise,
        exchange.then(() => {
          throw new Error("Exchange ended before resolving a live pairing identity");
        }),
      ]);
      const at = new Date().toISOString();
      const lifecycle =
        action === "deletion"
          ? access.withTenantRepositories(alpha, async (tenant) => {
              await tenant.lifecycle.requestDeletion({
                id: randomUUID(),
                requestedAt: at,
                purgeAfter: new Date(Date.now() + 86_400_000).toISOString(),
              });
              lifecycleApplied.release();
              await commitLifecycle.promise;
            })
          : database.sql.begin(async (sql) => {
              await sql.unsafe("SET LOCAL ROLE distil_migration");
              await new PostgresControlPlaneLifecycleRepository(
                sql as unknown as Sql,
                true
              ).suspendAccount({
                userId: alpha.userId,
                actorId: beta.actorId,
                requestId: beta.requestId,
                reason: "integration race",
                at,
              });
              lifecycleApplied.release();
              await commitLifecycle.promise;
            });
      let creation: Promise<unknown> | undefined;
      try {
        await Promise.race([
          lifecycleApplied.promise,
          lifecycle.then(() => {
            throw new Error("Lifecycle transaction ended before acquiring the account lock");
          }),
        ]);
        continueExchange.release();
        creation = createPairing().then(
          () => undefined,
          (error: unknown) => error
        );
        await waitForAccountLocks(2);
      } finally {
        continueExchange.release();
        commitLifecycle.release();
      }
      await lifecycle;
      await expect(exchange).resolves.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
      await expect(creation).resolves.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
      const summaries = await repositories().captureTokens.list();
      expect(summaries).toHaveLength(3);
      expect(summaries.every((token) => token.revokedAt)).toBe(true);
      for (const issued of [existing, browser, phone]) {
        await expect(
          tokenIdentities.resolveActiveByHash(hashCaptureToken(issued.token))
        ).resolves.toBeUndefined();
      }
      await expect(pairingIdentities.resolveByHash(pairing.hash)).resolves.toBeUndefined();
      await expect(pairingIdentities.resolveByHash(other.hash)).resolves.toMatchObject({
        userId: beta.userId,
      });
      await expect(repositories().shortcutPairings.findById(pairing.id)).resolves.toMatchObject({
        consumedAt: expect.any(String),
      });
    }
  );

  it("denies a stale resolved identity after the account is physically deleted", async () => {
    const pairing = await createPairing();
    const identity = await pairingIdentities.resolveByHash(pairing.hash);
    expect(identity).toBeDefined();
    await database.sql`DELETE FROM users WHERE id=${alpha.userId}::uuid`;
    await expect(
      exchangePairingCode(
        { code: pairing.code },
        {
          ...dependencies(),
          pairingIdentities: { resolveByHash: async () => identity },
        }
      )
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(pairingIdentities.resolveByHash(pairing.hash)).resolves.toBeUndefined();
    await expect(repositories().captureTokens.list()).resolves.toEqual([]);
    await expect(repositories().shortcutPairings.findById(pairing.id)).resolves.toBeUndefined();
  });
});
