import { resolve } from "node:path";
import postgres, { type Sql } from "postgres";
import {
  assertTenantMigrationInvariants,
  findTenantMigrationEvidence,
} from "../support/migration-invariants";
import { TenantRlsPoolHarness, observePooledTenantIsolation } from "../support/rls";
import { createTwoTenantFixture } from "../support/phase3-tenancy";
import { PostgresTestHarness } from "../support/postgres";

jest.setTimeout(120_000);

const migrations = resolve(process.cwd(), "src/lib/postgres/migrations");
const migrationEvidence = findTenantMigrationEvidence(migrations);
const describeWithTenantMigrations = migrationEvidence.present ? describe : describe.skip;

describeWithTenantMigrations(
  migrationEvidence.present
    ? "Phase 3 PostgreSQL tenant isolation"
    : "Phase 3 PostgreSQL tenant isolation (waiting for tenant migrations)",
  () => {
    const owner = new PostgresTestHarness();
    const fixture = createTwoTenantFixture();
    let applicationSql: Sql;
    let pool: TenantRlsPoolHarness;

    beforeAll(async () => {
      await owner.start();
      await owner.migrate(migrations);

      await owner.sql.unsafe(`
        CREATE ROLE distil_rls_test_app LOGIN PASSWORD 'distil_rls_test_password';
        GRANT USAGE ON SCHEMA public TO distil_rls_test_app;
        CREATE TABLE __distil_rls_pool_probe (
          id text NOT NULL,
          user_id uuid NOT NULL,
          value text NOT NULL,
          PRIMARY KEY (user_id, id)
        );
        ALTER TABLE __distil_rls_pool_probe ENABLE ROW LEVEL SECURITY;
        ALTER TABLE __distil_rls_pool_probe FORCE ROW LEVEL SECURITY;
        CREATE POLICY __distil_rls_pool_probe_isolation ON __distil_rls_pool_probe
          FOR ALL TO distil_rls_test_app
          USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
          WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
        GRANT SELECT, INSERT, UPDATE, DELETE ON __distil_rls_pool_probe TO distil_rls_test_app;
      `);
      await owner.sql`
        INSERT INTO __distil_rls_pool_probe (id, user_id, value)
        VALUES
          ('shared-id', ${fixture.alpha.user.id}::uuid, 'alpha-only'),
          ('shared-id', ${fixture.beta.user.id}::uuid, 'beta-only')
      `;

      const applicationUri = new URL(owner.connectionUri);
      applicationUri.username = "distil_rls_test_app";
      applicationUri.password = "distil_rls_test_password";
      applicationSql = postgres(applicationUri.toString(), {
        max: 1,
        prepare: false,
        connect_timeout: 10,
        onnotice: () => undefined,
      });
      await applicationSql`SELECT 1`;
      pool = new TenantRlsPoolHarness(applicationSql);
    });

    afterAll(async () => {
      if (applicationSql) await applicationSql.end({ timeout: 5 });
      await owner.sql.unsafe(`
        DROP TABLE IF EXISTS __distil_rls_pool_probe;
        DROP OWNED BY distil_rls_test_app;
        DROP ROLE IF EXISTS distil_rls_test_app;
      `);
      await owner.stop();
    });

    it("enforces required ownership and RLS migration invariants", async () => {
      await assertTenantMigrationInvariants(owner.sql, [
        {
          tableName: "items",
          tenantReferences: { tableName: "users" },
          policySetting: "app.user_id",
          tenantScopedUniqueKeys: [["normalized_url"]],
        },
        {
          tableName: "capture_requests",
          tenantReferences: { tableName: "users" },
          policySetting: "app.user_id",
          tenantScopedUniqueKeys: [["normalized_url"]],
        },
        {
          tableName: "job_queue",
          tenantReferences: { tableName: "users" },
          policySetting: "app.user_id",
        },
      ]);
    });

    it("does not leak tenant state while a one-connection pool alternates users", async () => {
      const observations = await observePooledTenantIsolation(
        pool,
        [fixture.alpha.auth.session, fixture.beta.auth.session, fixture.alpha.auth.captureToken],
        async (transaction) => {
          const rows = await transaction<{ value: string }[]>`
            SELECT value FROM __distil_rls_pool_probe ORDER BY value
          `;
          return rows.map(({ value }) => value);
        }
      );

      expect(observations).toEqual([
        {
          userId: fixture.alpha.user.id,
          result: ["alpha-only"],
          tenantAfterCheckout: null,
        },
        {
          userId: fixture.beta.user.id,
          result: ["beta-only"],
          tenantAfterCheckout: null,
        },
        {
          userId: fixture.alpha.user.id,
          result: ["alpha-only"],
          tenantAfterCheckout: null,
        },
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
      await expect(applicationSql`SELECT value FROM __distil_rls_pool_probe`).resolves.toHaveLength(
        0
      );
    });
  }
);
