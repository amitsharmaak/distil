import { planMigrations } from "@/lib/postgres/migration-plan";

describe("migration release planning", () => {
  const files = ["notes.md", "0002_capture.sql", "0001_phase1.sql"];

  it("applies a fresh database in version order", () => {
    expect(planMigrations(files, new Set())).toEqual(["0001_phase1.sql", "0002_capture.sql"]);
  });

  it("is a no-op after every migration is recorded", () => {
    expect(planMigrations(files, new Set(["0001_phase1.sql", "0002_capture.sql"]))).toEqual([]);
  });

  it("applies only a newly added second migration", () => {
    expect(planMigrations(files, new Set(["0001_phase1.sql"]))).toEqual(["0002_capture.sql"]);
  });
});
