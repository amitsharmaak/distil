import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres, { type Sql } from "postgres";

import { parseAuthContext } from "@/lib/contracts/tenant-context";
import { withTenantTransaction } from "@/lib/postgres/tenant-repositories";
import { applyTenantMigrationStage } from "@/lib/postgres/tenant-migration/migrator";
import { buildTenantMigrationReport } from "@/lib/postgres/tenant-migration/verifier";
import { assertTenantQueryPlans, type QueryPlanAdapter } from "../support/phase3-security";
import { createTwoTenantFixture } from "../support/phase3-tenancy";
import { PostgresTestHarness } from "../support/postgres";

jest.setTimeout(120_000);

const migrations = resolve(process.cwd(), "src/lib/postgres/migrations");
const tenantMigrations = resolve(process.cwd(), "src/lib/postgres/tenant-migrations");
const rolesSql = resolve(process.cwd(), "src/lib/postgres/roles/phase3_roles.sql");
const runtimeRole = "distil_wave4_query_app";

type ReviewedQuery = "feed" | "search" | "export" | "deletion";

const REVIEWED_QUERIES: Record<ReviewedQuery, string> = {
  feed: `
    SELECT i.id, i.user_id::text AS user_id
    FROM items i
    WHERE i.processing_status <> 'rejected' AND i.archived_at IS NULL
    ORDER BY i.created_at DESC, i.id DESC
    LIMIT 30
  `,
  search: `
    SELECT i.id, i.user_id::text AS user_id
    FROM items i
    WHERE i.search_vector @@ websearch_to_tsquery('english', 'wave4-needle')
    ORDER BY ts_rank(i.search_vector, websearch_to_tsquery('english', 'wave4-needle')) DESC,
      i.created_at DESC
    LIMIT 30
  `,
  export: `SELECT id, user_id::text AS user_id FROM items ORDER BY id`,
  deletion: `
    SELECT id, user_id::text AS user_id
    FROM account_deletions
    ORDER BY requested_at DESC
    LIMIT 1
  `,
};

function applicationClient(connectionUri: string): Sql {
  const url = new URL(connectionUri);
  url.username = runtimeRole;
  url.password = "distil_wave4_query_password";
  return postgres(url.toString(), {
    max: 2,
    prepare: false,
    connect_timeout: 10,
    onnotice: () => undefined,
  });
}

describe("P3-PERF-001: tenant query plans through the restricted runtime role", () => {
  const owner = new PostgresTestHarness();
  const fixture = createTwoTenantFixture();
  let applicationSql: Sql;

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
    await applyTenantMigrationStage({
      sql: owner.sql,
      stage: "lifecycle",
      ownerId: fixture.alpha.user.id,
      migrationsDirectory: tenantMigrations,
    });
    await owner.sql`
      INSERT INTO users (id, status)
      VALUES (${fixture.alpha.user.id}::uuid, 'active'), (${fixture.beta.user.id}::uuid, 'active')
      ON CONFLICT (id) DO UPDATE SET status='active'
    `;
    await owner.sql.unsafe(`
      CREATE ROLE ${runtimeRole} LOGIN PASSWORD 'distil_wave4_query_password'
        NOSUPERUSER NOBYPASSRLS;
      GRANT distil_runtime TO ${runtimeRole};
    `);

    for (const [prefix, userId] of [
      ["alpha", fixture.alpha.user.id],
      ["beta", fixture.beta.user.id],
    ] as const) {
      await owner.sql`
        INSERT INTO items
          (id,title,source_type,url,normalized_url,created_at,user_id)
        SELECT
          ${prefix} || '-' || sequence::text,
          CASE WHEN sequence % 25 = 0 THEN 'wave4-needle' ELSE 'ordinary item' END,
          'web',
          'https://example.test/' || ${prefix} || '/' || sequence::text,
          'https://example.test/' || ${prefix} || '/' || sequence::text,
          timestamptz '2026-01-01T00:00:00Z' + sequence * interval '1 second',
          ${userId}::uuid
        FROM generate_series(1, 2000) AS sequence
      `;
      await owner.sql`
        INSERT INTO account_deletions (id,user_id,status,requested_at,purge_after)
        SELECT
          md5(${prefix} || '-deletion-' || sequence::text)::uuid,
          ${userId}::uuid,
          'completed',
          timestamptz '2026-01-01T00:00:00Z' + sequence * interval '1 second',
          timestamptz '2026-02-01T00:00:00Z'
        FROM generate_series(1, 2000) AS sequence
      `;
    }
    await owner.sql`
      INSERT INTO users (id, status)
      SELECT md5('wave4-noise-user-' || sequence::text)::uuid, 'active'
      FROM generate_series(1, 18) AS sequence
    `;
    await owner.sql`
      INSERT INTO account_deletions (id,user_id,status,requested_at,purge_after)
      SELECT
        md5('wave4-noise-deletion-' || tenant::text || '-' || sequence::text)::uuid,
        md5('wave4-noise-user-' || tenant::text)::uuid,
        'completed',
        timestamptz '2026-01-01T00:00:00Z' + sequence * interval '1 second',
        timestamptz '2026-02-01T00:00:00Z'
      FROM generate_series(1, 18) AS tenant
      CROSS JOIN generate_series(1, 2000) AS sequence
    `;
    await owner.sql.unsafe("ANALYZE items; ANALYZE account_deletions");
    applicationSql = applicationClient(owner.connectionUri);
    await applicationSql`SELECT 1`;
  });

  afterAll(async () => {
    if (applicationSql) await applicationSql.end({ timeout: 5 });
    await owner.sql.unsafe(`
      DO $phase3_wave4_role_cleanup$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${runtimeRole}') THEN
          DROP OWNED BY ${runtimeRole};
          DROP ROLE ${runtimeRole};
        END IF;
      END
      $phase3_wave4_role_cleanup$;
    `);
    await owner.stop();
  });

  it("retains a visible tenant predicate for every reviewed access pattern", async () => {
    const observedPlans = new Map<string, string>();
    const adapter: QueryPlanAdapter = {
      explain: (context, query) =>
        withTenantTransaction(applicationSql, parseAuthContext(context), async (transaction) => {
          const rows = await transaction.unsafe<Array<{ "QUERY PLAN": string }>>(
            `EXPLAIN (FORMAT TEXT, COSTS TRUE) ${REVIEWED_QUERIES[query]}`
          );
          const plan = rows.map((row) => row["QUERY PLAN"]).join("\n");
          if (process.env.DISTIL_WAVE4_PRINT_PLANS === "1") {
            process.stderr.write(`\n[${context.userId} ${query}]\n${plan}\n`);
          }
          observedPlans.set(`${context.userId}:${query}`, plan);
          return plan;
        }),
    };

    await expect(
      assertTenantQueryPlans(adapter, [fixture.alpha.auth.session, fixture.beta.auth.session])
    ).resolves.toBeUndefined();

    for (const [label, plan] of observedPlans) {
      const normalized = plan.toLowerCase();
      if (!normalized.includes("index cond: (user_id =")) {
        throw new Error(`${label} did not enter through a tenant index:\n${plan}`);
      }
      if (/seq scan on (?:items|account_deletions)\b/.test(normalized)) {
        throw new Error(`${label} scanned a tenant-bearing base table globally:\n${plan}`);
      }
    }
  });

  it("returns only each tenant's rows for the same reviewed queries", async () => {
    for (const tenant of [fixture.alpha, fixture.beta]) {
      await withTenantTransaction(
        applicationSql,
        parseAuthContext(tenant.auth.session),
        async (transaction) => {
          for (const query of Object.values(REVIEWED_QUERIES)) {
            const rows = await transaction.unsafe<Array<{ id: string; user_id: string }>>(query);
            expect(rows.length).toBeGreaterThan(0);
            expect(rows.every(({ user_id: userId }) => userId === tenant.user.id)).toBe(true);
          }
        }
      );
    }
  });
});
