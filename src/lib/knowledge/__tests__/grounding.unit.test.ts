import { createClaimEvidence } from "../grounding";

describe("claim evidence", () => {
  it("derives an exact, hashed UTF-16 span from a retrieved chunk", () => {
    const chunkContent = "A 🚀 launch produced measurable results.";
    const startOffset = chunkContent.indexOf("launch");
    const evidence = createClaimEvidence({
      claimId: "claim-1",
      chunkId: "chunk-1",
      chunkContent,
      startOffset,
      endOffset: startOffset + "launch produced measurable results".length,
    });

    expect(evidence).toEqual({
      claimId: "claim-1",
      chunkId: "chunk-1",
      startOffset,
      endOffset: startOffset + 34,
      exactExcerpt: "launch produced measurable results",
      evidenceHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
  });

  it("rejects fabricated or empty spans", () => {
    expect(() =>
      createClaimEvidence({
        claimId: "claim-1",
        chunkId: "chunk-1",
        chunkContent: "source",
        startOffset: 0,
        endOffset: 99,
      })
    ).toThrow(/inside the chunk/);
    expect(() =>
      createClaimEvidence({
        claimId: "claim-1",
        chunkId: "chunk-1",
        chunkContent: "...",
        startOffset: 0,
        endOffset: 3,
      })
    ).toThrow(/contain source text/);
  });
});
