import { buildDryRunPlan, parseTenantMigrationArgs } from "../tenant-migration/cli";

const ownerId = "123e4567-e89b-42d3-a456-426614174000";

describe("tenant migration CLI contract", () => {
  it("requires Amit's UUID explicitly and never accepts inferred ownership", () => {
    expect(() => parseTenantMigrationArgs(["--dry-run"])).toThrow("ownership is never inferred");
    expect(() =>
      parseTenantMigrationArgs(["--amit-user-id", "amit@example.com", "--dry-run"])
    ).toThrow("explicit RFC 4122 UUID");
  });

  it("supports a connection-free dry run", () => {
    const options = parseTenantMigrationArgs(["--amit-user-id", ownerId, "--dry-run"]);
    const plan = buildDryRunPlan(options.ownerId);
    expect(options).toEqual({ ownerId, dryRun: true });
    expect(plan).toMatchObject({
      mode: "dry-run",
      readOnly: true,
      connectsToDatabase: false,
      immutableOwner: { userId: ownerId, source: "explicit-cli-argument" },
    });
    expect(plan.tenantTables).toHaveLength(36);
    expect(plan.lifecycle).toEqual([
      expect.objectContaining({ stage: "expand", implementedHere: true }),
      expect.objectContaining({ stage: "backfill", implementedHere: true }),
      expect.objectContaining({ stage: "verify", implementedHere: true }),
      expect.objectContaining({ stage: "contract", implementedHere: true }),
    ]);
    expect(JSON.stringify(plan)).not.toContain("email");
  });

  it("requires an output for rehearsals and before snapshots", () => {
    expect(() =>
      parseTenantMigrationArgs(["--amit-user-id", ownerId, "--stage", "rehearsal"])
    ).toThrow("--output is required");
    expect(
      parseTenantMigrationArgs([
        "--amit-user-id",
        ownerId.toUpperCase(),
        "--stage",
        "before",
        "--output",
        "before.json",
      ])
    ).toEqual({ ownerId, dryRun: false, stage: "before", output: "before.json" });
  });

  it("requires a baseline only for after verification", () => {
    expect(() =>
      parseTenantMigrationArgs([
        "--amit-user-id",
        ownerId,
        "--stage",
        "after",
        "--output",
        "after.json",
      ])
    ).toThrow("--baseline is required");
    expect(() =>
      parseTenantMigrationArgs([
        "--amit-user-id",
        ownerId,
        "--stage",
        "before",
        "--baseline",
        "old.json",
        "--output",
        "before.json",
      ])
    ).toThrow("only valid for the after stage");
  });
});
