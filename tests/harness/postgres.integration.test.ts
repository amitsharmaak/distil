import { resolve } from "node:path";
import { PostgresTestHarness } from "../support/postgres";

jest.setTimeout(120_000);

describe("PostgreSQL 16 test harness lifecycle", () => {
  const harness = new PostgresTestHarness();

  beforeAll(async () => {
    await harness.start();
    await harness.migrate(resolve(__dirname, "../fixtures/migrations"));
  });

  afterAll(async () => {
    await harness.sql.begin(async (transaction) => {
      await transaction.unsafe("DROP TABLE IF EXISTS harness_records");
      await transaction`
        DELETE FROM __distil_test_migrations
        WHERE name = '0001_create_harness_records.sql'
      `;
    });
    await harness.stop();
  });

  it("starts PostgreSQL 16, migrates, and exposes a working client", async () => {
    const version = await harness.sql<{ major: number }[]>`
      SELECT current_setting('server_version_num')::int / 10000 AS major
    `;
    const tables = await harness.sql<{ name: string | null }[]>`
      SELECT to_regclass('public.harness_records')::text AS name
    `;

    expect(version[0].major).toBe(16);
    expect(tables[0].name).toBe("harness_records");
  });

  it("resets rows and identities while preserving migrations", async () => {
    const migrationsBeforeReset = await harness.sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM __distil_test_migrations
    `;
    const first = await harness.sql<{ id: string }[]>`
      INSERT INTO harness_records (value)
      VALUES ('before-reset')
      RETURNING id
    `;
    expect(first[0].id).toBe("1");

    await harness.reset();

    const rows = await harness.sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM harness_records
    `;
    const afterReset = await harness.sql<{ id: string }[]>`
      INSERT INTO harness_records (value)
      VALUES ('after-reset')
      RETURNING id
    `;
    const migrations = await harness.sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM __distil_test_migrations
    `;

    expect(rows[0].count).toBe("0");
    expect(afterReset[0].id).toBe("1");
    expect(migrations[0].count).toBe(migrationsBeforeReset[0].count);
  });
});
