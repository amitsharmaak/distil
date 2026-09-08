import { parseOptions } from "../run-knowledge-backfill";

const userId = "11111111-1111-4111-8111-111111111111";

describe("knowledge backfill CLI", () => {
  it("is dry-run by default and selects every non-vector Phase 2 backfill", () => {
    expect(parseOptions(["--user-id", userId])).toEqual({
      userId,
      selectedKinds: [
        "content_versions",
        "chunks",
        "legacy_artifacts",
        "degraded_summaries",
      ],
      batchSize: 25,
      execute: false,
      maxBatches: 10_000,
    });
  });

  it("requires an explicit execute switch and validates bounds", () => {
    expect(
      parseOptions([
        "--user-id",
        userId,
        "--kind",
        "chunks",
        "--batch-size",
        "50",
        "--max-batches",
        "20",
        "--execute",
      ])
    ).toMatchObject({ selectedKinds: ["chunks"], batchSize: 50, maxBatches: 20, execute: true });
    expect(() => parseOptions(["--user-id", userId, "--kind", "embeddings"])).toThrow(
      "Unsupported backfill kind"
    );
    expect(() => parseOptions(["--user-id", userId, "--batch-size", "101"])).toThrow(
      "--batch-size"
    );
  });
});
