import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { TransactionSql } from "postgres";
import {
  TENANT_MIGRATION_STAGES,
  applyTenantMigrationStage,
} from "@/lib/postgres/tenant-migration/migrator";
import { buildTenantMigrationReport } from "@/lib/postgres/tenant-migration/verifier";
import { PostgresTestHarness } from "../support/postgres";

jest.setTimeout(120_000);
const database = new PostgresTestHarness();
const ownerId = "10000000-0000-4000-8000-000000000001";
const otherId = "10000000-0000-4000-8000-000000000002";

async function asRuntime<T>(operation: (sql: TransactionSql) => Promise<T>) {
  return database.sql.begin(async (sql) => {
    await sql.unsafe("SET LOCAL ROLE distil_runtime");
    return operation(sql);
  });
}

beforeAll(async () => {
  await database.start();
  await database.migrate(resolve(process.cwd(), "src/lib/postgres/migrations"));
  await database.sql.unsafe("DROP TABLE __distil_test_migrations");
  await database.sql.unsafe(
    await readFile(resolve(process.cwd(), "src/lib/postgres/roles/phase3_roles.sql"), "utf8")
  );
  await applyTenantMigrationStage({ sql: database.sql, stage: "expand", ownerId });
  const baseline = await buildTenantMigrationReport({
    client: database.sql,
    stage: "before",
    through: "expand",
    ownerId,
  });
  for (const stage of TENANT_MIGRATION_STAGES.filter((stage) => stage !== "expand")) {
    await applyTenantMigrationStage({
      sql: database.sql,
      stage,
      ownerId,
      ...(stage === "contract" ? { baseline } : {}),
    });
  }
  await database.sql`INSERT INTO users (id, status) VALUES (${ownerId}::uuid, 'active'), (${otherId}::uuid, 'active') ON CONFLICT (id) DO UPDATE SET status = 'active'`;
});
afterAll(async () => database.stop());

describe("phone-pairing schema and pre-context functions", () => {
  it("verifies the fully migrated database including structured summary JSON", async () => {
    await expect(
      buildTenantMigrationReport({
        client: database.sql,
        stage: "rehearsal",
        through: "phone-pairing",
        ownerId,
      })
    ).resolves.toMatchObject({ verification: { passed: true } });
  });

  it("grants runtime only the bounded functions and tenant pairing view", async () => {
    const rows = await database.sql`
      SELECT p.proname, r.rolname AS owner, p.prosecdef, p.proconfig,
        has_function_privilege('distil_runtime', p.oid, 'EXECUTE') AS runtime_exec,
        EXISTS (SELECT 1 FROM aclexplode(p.proacl) acl WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE') AS public_exec
      FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
      WHERE p.proname IN ('distil_resolve_shortcut_pairing', 'distil_consume_shortcut_pairing_rate_limit')
    `;
    expect(rows).toHaveLength(2);
    for (const row of rows)
      expect(row).toMatchObject({
        owner: "distil_migration",
        prosecdef: true,
        runtime_exec: true,
        public_exec: false,
        proconfig: ["search_path=pg_catalog, public"],
      });
    await expect(
      asRuntime(async (sql) => sql`SELECT * FROM public.shortcut_pairing_rate_limits`)
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRuntime(async (sql) => sql`SELECT * FROM public.shortcut_pairings`)
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRuntime(async (sql) => sql`SELECT * FROM tenant_api.shortcut_pairings`)
    ).resolves.toHaveLength(0);
  });

  it("admits ten durable attempts per hashed key and rejects invalid keys without recording them", async () => {
    const key = "a".repeat(64);
    const rows = await asRuntime(
      async (sql) => sql`
      SELECT public.distil_consume_shortcut_pairing_rate_limit(${key}) AS allowed FROM generate_series(1, 12)
    `
    );
    expect(rows.map(({ allowed }) => allowed)).toEqual([...Array(10).fill(true), false, false]);
    await expect(
      asRuntime(
        async (sql) =>
          sql`SELECT public.distil_consume_shortcut_pairing_rate_limit(${"b".repeat(64)}) AS allowed`
      )
    ).resolves.toMatchObject([{ allowed: true }]);
    const invalid = await asRuntime(
      async (sql) =>
        sql`SELECT public.distil_consume_shortcut_pairing_rate_limit('invalid') AS allowed`
    );
    expect(invalid[0].allowed).toBe(false);
    const stored =
      await database.sql`SELECT key_hash, attempts FROM shortcut_pairing_rate_limits ORDER BY key_hash`;
    expect(stored).toEqual([
      { key_hash: key, attempts: 11 },
      { key_hash: "b".repeat(64), attempts: 1 },
    ]);
  });

  it("resolves exact live hashes only, denies suspended accounts, and keeps the view tenant-bound", async () => {
    await database.sql`INSERT INTO shortcut_pairings (user_id, id, code_hash, expires_at) VALUES (${ownerId}::uuid, 'schema-pairing', 'schema-test-hash', now() + interval '10 minutes')`;
    await expect(
      asRuntime(
        async (sql) => sql`SELECT * FROM distil_resolve_shortcut_pairing('schema-test-hash')`
      )
    ).resolves.toMatchObject([{ pairing_id: "schema-pairing", user_id: ownerId }]);
    await expect(
      asRuntime(async (sql) => sql`SELECT * FROM distil_resolve_shortcut_pairing('schema-test')`)
    ).resolves.toHaveLength(0);
    await expect(
      asRuntime(async (sql) => {
        await sql`SELECT set_config('app.user_id', ${otherId}, true)`;
        return sql`SELECT * FROM tenant_api.shortcut_pairings`;
      })
    ).resolves.toHaveLength(0);
    await database.sql`UPDATE users SET status = 'suspended' WHERE id = ${ownerId}::uuid`;
    await expect(
      asRuntime(
        async (sql) => sql`SELECT * FROM distil_resolve_shortcut_pairing('schema-test-hash')`
      )
    ).resolves.toHaveLength(0);
    await database.sql`UPDATE users SET status = 'active' WHERE id = ${ownerId}::uuid`;
    await database.sql`UPDATE shortcut_pairings SET consumed_at = now() WHERE user_id = ${ownerId}::uuid`;
    await expect(
      asRuntime(
        async (sql) => sql`SELECT * FROM distil_resolve_shortcut_pairing('schema-test-hash')`
      )
    ).resolves.toHaveLength(0);
  });
});
