import { resolve } from "node:path";
import { loadSqlMigrations, PostgresTestHarness } from "../support/postgres";

describe("PostgreSQL harness helpers", () => {
  it("loads ordered SQL migrations with stable checksums", async () => {
    const migrations = await loadSqlMigrations(resolve(__dirname, "../fixtures/migrations"));

    expect(migrations).toHaveLength(1);
    expect(migrations[0]).toMatchObject({
      name: "0001_create_harness_records.sql",
      checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(migrations[0].sql).toContain("CREATE TABLE harness_records");
  });

  it("guards access before the container starts", async () => {
    const harness = new PostgresTestHarness();
    expect(() => harness.sql).toThrow("has not been started");
    expect(() => harness.connectionUri).toThrow("has not been started");
    await expect(harness.stop()).resolves.toBeUndefined();
  });
});
