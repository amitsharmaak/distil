import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres, { type Sql } from "postgres";
import {
  tenantMigrationManifest,
  tenantProtectedTables,
} from "@/lib/postgres/tenant-migration/manifest";
import { applyTenantMigrationStage } from "@/lib/postgres/tenant-migration/migrator";
import { buildTenantMigrationReport } from "@/lib/postgres/tenant-migration/verifier";
import {
  assertTenantMigrationInvariants,
  findTenantIsolationActivation,
  tenantManifestInvariantSpecs,
} from "../support/migration-invariants";
import { createTwoTenantFixture } from "../support/phase3-tenancy";
import { PostgresTestHarness } from "../support/postgres";
import { TenantRlsPoolHarness, observePooledTenantIsolation } from "../support/rls";

jest.setTimeout(120_000);

const migrations = resolve(process.cwd(), "src/lib/postgres/migrations");
const tenantMigrations = resolve(process.cwd(), "src/lib/postgres/tenant-migrations");
const rolesSql = resolve(process.cwd(), "src/lib/postgres/roles/phase3_roles.sql");
const activation = findTenantIsolationActivation(tenantMigrations, tenantMigrationManifest);
const describeWithTenantMigration = activation.ready ? describe : describe.skip;
const runtimeRole = "distil_rls_test_app";

describeWithTenantMigration(
  activation.ready
    ? "P3-DB-001/P3-DB-002: PostgreSQL tenant isolation"
    : "P3-DB-001/P3-DB-002: PostgreSQL tenant isolation (waiting for the full Phase 3 migration)",
  () => {
    const owner = new PostgresTestHarness();
    const fixture = createTwoTenantFixture();
    let applicationSql: Sql;
    let concurrencySql: Sql;
    let pool: TenantRlsPoolHarness;
    let concurrencyPool: TenantRlsPoolHarness;

    beforeAll(async () => {
      await owner.start();
      await owner.migrate(migrations);
      await owner.sql.unsafe("DROP TABLE __distil_test_migrations");
      await owner.sql.unsafe(await readFile(rolesSql, "utf8"));
      await applyTenantMigrationStage({
        sql: owner.sql,
        stage: "expand",
        ownerId: fixture.alpha.user.id,
        migrationsDirectory: tenantMigrations,
      });
      const baseline = await buildTenantMigrationReport({
        client: owner.sql,
        stage: "before",
        ownerId: fixture.alpha.user.id,
      });
      await applyTenantMigrationStage({
        sql: owner.sql,
        stage: "backfill",
        ownerId: fixture.alpha.user.id,
        migrationsDirectory: tenantMigrations,
      });
      await applyTenantMigrationStage({
        sql: owner.sql,
        stage: "contract",
        ownerId: fixture.alpha.user.id,
        migrationsDirectory: tenantMigrations,
        baseline,
      });

      await owner.sql`
        INSERT INTO users (id)
        VALUES (${fixture.alpha.user.id}::uuid), (${fixture.beta.user.id}::uuid)
        ON CONFLICT (id) DO NOTHING
      `;

      await owner.sql.unsafe(`
        CREATE ROLE ${runtimeRole} LOGIN PASSWORD 'distil_rls_test_password' NOSUPERUSER NOBYPASSRLS;
        GRANT USAGE ON SCHEMA public TO ${runtimeRole};
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${runtimeRole};
        CREATE TABLE __distil_rls_pool_probe (
          id text NOT NULL,
          user_id uuid NOT NULL,
          value text NOT NULL,
          PRIMARY KEY (user_id, id)
        );
        ALTER TABLE __distil_rls_pool_probe ENABLE ROW LEVEL SECURITY;
        ALTER TABLE __distil_rls_pool_probe FORCE ROW LEVEL SECURITY;
        CREATE POLICY __distil_rls_pool_probe_isolation ON __distil_rls_pool_probe
          FOR ALL TO ${runtimeRole}
          USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
          WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
        GRANT SELECT, INSERT, UPDATE, DELETE ON __distil_rls_pool_probe TO ${runtimeRole};
      `);

      await owner.sql.begin(async (transaction) => {
        await transaction`SELECT set_config('app.user_id', ${fixture.alpha.user.id}, true)`;
        await transaction`
          INSERT INTO __distil_rls_pool_probe (id, user_id, value)
          VALUES ('shared-id', ${fixture.alpha.user.id}::uuid, 'alpha-only')
        `;
      });
      await owner.sql.begin(async (transaction) => {
        await transaction`SELECT set_config('app.user_id', ${fixture.beta.user.id}, true)`;
        await transaction`
          INSERT INTO __distil_rls_pool_probe (id, user_id, value)
          VALUES ('shared-id', ${fixture.beta.user.id}::uuid, 'beta-only')
        `;
      });

      const applicationUri = new URL(owner.connectionUri);
      applicationUri.username = runtimeRole;
      applicationUri.password = "distil_rls_test_password";
      applicationSql = postgres(applicationUri.toString(), {
        max: 1,
        prepare: false,
        connect_timeout: 10,
        onnotice: () => undefined,
      });
      await applicationSql`SELECT 1`;
      pool = new TenantRlsPoolHarness(applicationSql);
      concurrencySql = postgres(applicationUri.toString(), {
        max: 2,
        prepare: false,
        connect_timeout: 10,
        onnotice: () => undefined,
      });
      await concurrencySql`SELECT 1`;
      concurrencyPool = new TenantRlsPoolHarness(concurrencySql);
    });

    afterAll(async () => {
      if (applicationSql) await applicationSql.end({ timeout: 5 });
      if (concurrencySql) await concurrencySql.end({ timeout: 5 });
      await owner.sql.unsafe(`
        DROP TABLE IF EXISTS __distil_rls_pool_probe;
        DROP OWNED BY ${runtimeRole};
        DROP ROLE IF EXISTS ${runtimeRole};
      `);
      await owner.stop();
    });

    it("checks every Phase 2 and Wave 0 tenant table for ownership, composite FKs, FORCE RLS, CRUD policies, and scoped keys", async () => {
      await assertTenantMigrationInvariants(
        owner.sql,
        [
          ...tenantManifestInvariantSpecs(tenantMigrationManifest),
          ...tenantProtectedTables
            .filter(
              ({ table }) =>
                !tenantMigrationManifest.tables.some((classified) => classified.table === table)
            )
            .map(({ table, ownerColumn }) => ({
              tableName: table,
              ownerColumn,
              ...(table === "users" ? {} : { tenantReferences: { tableName: "users" } }),
              policySetting: "app.user_id",
            })),
        ]
      );
    });

    it("uses a restricted, non-owner runtime role", async () => {
      const [role] = await owner.sql<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
        SELECT rolsuper, rolbypassrls
        FROM pg_catalog.pg_roles
        WHERE rolname = ${runtimeRole}
      `;
      const ownedTenantTables = await owner.sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM pg_catalog.pg_class relation
        JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = relation.relowner
        WHERE relation.relnamespace = 'public'::regnamespace
          AND owner_role.rolname = ${runtimeRole}
      `;

      expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
      expect(ownedTenantTables[0]?.count).toBe("0");
    });

    it("fails closed with no tenant context and enforces all CRUD operations through the runtime role", async () => {
      await expect(applicationSql`SELECT value FROM __distil_rls_pool_probe`).resolves.toHaveLength(
        0
      );
      await expect(
        applicationSql`
          INSERT INTO __distil_rls_pool_probe (id, user_id, value)
          VALUES ('missing-context', ${fixture.alpha.user.id}::uuid, 'must-fail')
        `
      ).rejects.toThrow();

      await pool.asTenant(fixture.alpha.auth.session, async (transaction) => {
        await expect(
          transaction<{ value: string }[]>`
            SELECT value FROM __distil_rls_pool_probe ORDER BY value
          `
        ).resolves.toEqual([{ value: "alpha-only" }]);
        await expect(
          transaction`
            UPDATE __distil_rls_pool_probe SET value = 'forged'
            WHERE user_id = ${fixture.beta.user.id}::uuid AND id = 'shared-id'
          `
        ).resolves.toHaveLength(0);
        await expect(
          transaction`
            DELETE FROM __distil_rls_pool_probe
            WHERE user_id = ${fixture.beta.user.id}::uuid AND id = 'shared-id'
          `
        ).resolves.toHaveLength(0);
        await expect(
          transaction`
            INSERT INTO __distil_rls_pool_probe (id, user_id, value)
            VALUES ('alpha-insert', ${fixture.alpha.user.id}::uuid, 'allowed')
          `
        ).resolves.toHaveLength(1);
        await expect(
          transaction`
            INSERT INTO __distil_rls_pool_probe (id, user_id, value)
            VALUES ('forged-insert', ${fixture.beta.user.id}::uuid, 'must-fail')
          `
        ).rejects.toThrow();
      });
    });

    it("allows concurrent tenants to use the same URL, digest date, and singleton key", async () => {
      const writeTenantFixtures = async (userId: string, itemId: string, captureId: string) =>
        concurrencyPool.asTenant(
          userId === fixture.alpha.user.id ? fixture.alpha.auth.session : fixture.beta.auth.session,
          async (transaction) => {
            await transaction`
              INSERT INTO items
                (id, user_id, title, summary, source_type, url, normalized_url, created_at)
              VALUES
                (${itemId}, ${userId}::uuid, 'Shared URL', '', 'web',
                 'https://example.test/shared', 'https://example.test/shared', now())
            `;
            await transaction`
              INSERT INTO capture_requests
                (id, user_id, url, normalized_url, source, created_at, updated_at)
              VALUES
                (${captureId}, ${userId}::uuid, 'https://example.test/shared',
                 'https://example.test/shared', 'web', now(), now())
            `;
            await transaction`
              INSERT INTO digest_runs (id, user_id, digest_date, local_date, created_at)
              VALUES
                (${`digest-${itemId}`}, ${userId}::uuid, '2026-09-07', '2026-09-07', now())
            `;
            await transaction`
              INSERT INTO personal_preferences (id, user_id, updated_at)
              VALUES ('default', ${userId}::uuid, now())
            `;
          }
        );

      await Promise.all([
        writeTenantFixtures(
          fixture.alpha.user.id,
          fixture.alpha.resources.itemId,
          fixture.alpha.resources.captureId
        ),
        writeTenantFixtures(
          fixture.beta.user.id,
          fixture.beta.resources.itemId,
          fixture.beta.resources.captureId
        ),
      ]);

      const counts = await Promise.all(
        [fixture.alpha.auth.session, fixture.beta.auth.session].map((context) =>
          pool.asTenant(context, async (transaction) => {
            const [items, captures, digests, preferences] = await Promise.all([
              transaction<{ count: string }[]>`SELECT count(*)::text AS count FROM items`,
              transaction<
                { count: string }[]
              >`SELECT count(*)::text AS count FROM capture_requests`,
              transaction<{ count: string }[]>`SELECT count(*)::text AS count FROM digest_runs`,
              transaction<{ count: string }[]>`
                SELECT count(*)::text AS count FROM personal_preferences
              `,
            ]);
            return [items[0].count, captures[0].count, digests[0].count, preferences[0].count];
          })
        )
      );

      expect(counts).toEqual([
        ["1", "1", "1", "1"],
        ["1", "1", "1", "1"],
      ]);
    });

    it("does not leak tenant state while a one-connection pool alternates users", async () => {
      const observations = await observePooledTenantIsolation(
        pool,
        [fixture.alpha.auth.session, fixture.beta.auth.session, fixture.alpha.auth.captureToken],
        async (transaction) => {
          const rows = await transaction<{ value: string }[]>`
            SELECT value FROM __distil_rls_pool_probe WHERE id = 'shared-id' ORDER BY value
          `;
          return rows.map(({ value }) => value);
        }
      );

      expect(observations).toEqual([
        { userId: fixture.alpha.user.id, result: ["alpha-only"], tenantAfterCheckout: null },
        { userId: fixture.beta.user.id, result: ["beta-only"], tenantAfterCheckout: null },
        { userId: fixture.alpha.user.id, result: ["alpha-only"], tenantAfterCheckout: null },
      ]);
    });

    it("clears transaction-local tenant state after rollback", async () => {
      await expect(
        pool.asTenant(fixture.beta.auth.session, async (transaction) => {
          await transaction`SELECT value FROM __distil_rls_pool_probe`;
          throw new Error("deliberate rollback");
        })
      ).rejects.toThrow("deliberate rollback");
      await expect(pool.assertTenantCleared()).resolves.toBeUndefined();
    });
  }
);

describe("P3 activation precision", () => {
  it("does not skip for a partial tenant migration", () => {
    if (activation.ready) expect(activation.missing).toEqual([]);
    else expect(activation.missing.length).toBeGreaterThan(1);
  });
});
