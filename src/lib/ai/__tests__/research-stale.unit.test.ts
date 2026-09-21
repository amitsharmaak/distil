import { failStaleReport, STALE_RESEARCH_MS } from "../research";
import type { RepositorySet } from "@/lib/repositories/ports";

function repositoriesWith(updateReport: jest.Mock): RepositorySet {
  return { research: { updateReport } } as unknown as RepositorySet;
}

const now = Date.parse("2026-09-21T10:00:00.000Z");

describe("failStaleReport", () => {
  it("leaves terminal reports untouched", async () => {
    const updateReport = jest.fn();
    const report = { id: "r1", status: "completed", createdAt: "2020-01-01T00:00:00.000Z" };

    await expect(failStaleReport(repositoriesWith(updateReport), report, now)).resolves.toBe(
      report
    );
    expect(updateReport).not.toHaveBeenCalled();
  });

  it("leaves a recent running report untouched", async () => {
    const updateReport = jest.fn();
    const createdAt = new Date(now - STALE_RESEARCH_MS + 1000).toISOString();
    const report = { id: "r1", status: "running", createdAt };

    await expect(failStaleReport(repositoriesWith(updateReport), report, now)).resolves.toBe(
      report
    );
    expect(updateReport).not.toHaveBeenCalled();
  });

  it("marks a running report failed once it exceeds the stale window", async () => {
    const createdAt = new Date(now - STALE_RESEARCH_MS - 1).toISOString();
    const updated = { id: "r1", status: "failed", createdAt, report: "stored" };
    const updateReport = jest.fn().mockResolvedValue(updated);

    const result = await failStaleReport(
      repositoriesWith(updateReport),
      { id: "r1", status: "running", createdAt },
      now
    );

    expect(updateReport).toHaveBeenCalledWith("r1", {
      status: "failed",
      report: expect.stringContaining("timed out"),
      completedAt: new Date(now).toISOString(),
      progress: null,
    });
    expect(result).toBe(updated);
  });

  it("returns a failed copy when the update does not return a record", async () => {
    const createdAt = new Date(now - STALE_RESEARCH_MS - 1).toISOString();
    const updateReport = jest.fn().mockResolvedValue(undefined);

    const report: { id: string; status: string; createdAt: string; completedAt?: string } = {
      id: "r1",
      status: "pending",
      createdAt,
    };
    const result = await failStaleReport(repositoriesWith(updateReport), report, now);

    expect(result.status).toBe("failed");
    expect(result.completedAt).toBe(new Date(now).toISOString());
  });
});
