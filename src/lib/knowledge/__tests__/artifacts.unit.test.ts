import { canTransitionArtifact, createDegradedSummary, type ArtifactStatus } from "../artifacts";

describe("intelligence artifact lifecycle", () => {
  it.each<[ArtifactStatus, ArtifactStatus]>([
    ["pending", "ready"],
    ["pending", "degraded"],
    ["pending", "failed"],
    ["ready", "stale"],
    ["degraded", "stale"],
  ])("allows %s -> %s", (from, to) => {
    expect(canTransitionArtifact(from, to)).toBe(true);
  });

  it("does not mutate terminal artifacts or overwrite a valid artifact in place", () => {
    expect(canTransitionArtifact("ready", "pending")).toBe(false);
    expect(canTransitionArtifact("failed", "pending")).toBe(false);
    expect(canTransitionArtifact("stale", "ready")).toBe(false);
  });
});

describe("deterministic degraded summaries", () => {
  it("uses the title and first two usable source sentences without a provider", () => {
    const summary = createDegradedSummary({
      title: "  Durable knowledge  ",
      content: "First source fact. Second source fact! Third source fact?",
    });

    expect(summary).toEqual({
      status: "degraded",
      reason: "generation_unavailable",
      content: "Durable knowledge\n\nFirst source fact.\n\nSecond source fact!",
      contentHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      sentenceCount: 2,
    });
    expect(
      createDegradedSummary({
        title: "  Durable knowledge  ",
        content: "First source fact. Second source fact! Third source fact?",
      })
    ).toEqual(summary);
  });

  it("does not duplicate a title repeated as the first source sentence", () => {
    expect(
      createDegradedSummary({ title: "Same title.", content: "Same title. Supporting fact." })
        .content
    ).toBe("Same title.\n\nSupporting fact.");
  });
});
