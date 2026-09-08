import type { Sql } from "postgres";

import { applyTenantMigrationStage } from "../tenant-migration/migrator";

const ownerId = "123e4567-e89b-42d3-a456-426614174000";

function sqlDouble() {
  const applied: Array<{ stage: string; name: string; checksum: string; owner_id: string }> = [];
  const unsafeStatements: string[] = [];
  const sql = jest.fn(
    async (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> => {
      const query = strings.join("?");
      if (query.includes("SELECT stage, name, checksum")) return applied.slice();
      if (query.includes("INSERT INTO distil_tenant_migrations")) {
        applied.push({
          stage: String(values[0]),
          name: String(values[1]),
          checksum: String(values[2]),
          owner_id: String(values[3]),
        });
      }
      return [];
    }
  ) as unknown as Sql;
  Object.assign(sql, {
    unsafe: jest.fn(async (statement: string) => {
      unsafeStatements.push(statement);
      return [];
    }),
    begin: jest.fn(async (operation: (transaction: Sql) => Promise<unknown>) => operation(sql)),
  });
  return { sql, applied, unsafeStatements };
}

describe("staged tenant migrator", () => {
  it("applies one explicit stage and treats an exact retry as a no-op", async () => {
    const fake = sqlDouble();
    const first = await applyTenantMigrationStage({ sql: fake.sql, stage: "expand", ownerId });
    const retry = await applyTenantMigrationStage({ sql: fake.sql, stage: "expand", ownerId });

    expect(first).toMatchObject({ stage: "expand", alreadyApplied: false, ownerId });
    expect(retry).toMatchObject({ stage: "expand", alreadyApplied: true, ownerId });
    expect(fake.applied).toHaveLength(1);
    expect(
      fake.unsafeStatements.filter((statement) =>
        statement.includes("CREATE TABLE IF NOT EXISTS users")
      )
    ).toHaveLength(1);
  });

  it("requires ordered stages and one immutable owner UUID", async () => {
    const fake = sqlDouble();
    await expect(
      applyTenantMigrationStage({ sql: fake.sql, stage: "backfill", ownerId })
    ).rejects.toThrow("requires the expand stage first");

    await applyTenantMigrationStage({ sql: fake.sql, stage: "expand", ownerId });
    await expect(
      applyTenantMigrationStage({
        sql: fake.sql,
        stage: "backfill",
        ownerId: "223e4567-e89b-42d3-a456-426614174000",
      })
    ).rejects.toThrow("different owner UUID");
  });

  it("will not enter contract without the frozen before report", async () => {
    const fake = sqlDouble();
    await expect(
      applyTenantMigrationStage({ sql: fake.sql, stage: "contract", ownerId })
    ).rejects.toThrow("requires the frozen before report");
    expect(fake.unsafeStatements).toHaveLength(0);
  });

  it("applies the additive lifecycle stage only after the contract ledger entry", async () => {
    const fake = sqlDouble();
    for (const [stage, name] of [
      ["expand", "0005_phase3_tenant_expand.sql"],
      ["backfill", "0006_phase3_tenant_backfill.sql"],
      ["contract", "0007_phase3_tenant_contract.sql"],
    ]) {
      fake.applied.push({ stage, name, checksum: "accepted", owner_id: ownerId });
    }
    await expect(
      applyTenantMigrationStage({ sql: fake.sql, stage: "lifecycle", ownerId })
    ).resolves.toMatchObject({
      stage: "lifecycle",
      file: "0008_phase3_lifecycle.sql",
      alreadyApplied: false,
    });
  });
});
