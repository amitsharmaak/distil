import {
  evaluateAbstention,
  evaluateCitations,
  evaluateRanking,
  evaluateRetrieval,
  evaluateSummaryGrounding,
  ndcgAtK,
} from "./metrics";
import {
  abstentionFixtures,
  citationFixtures,
  rankingFixtures,
  retrievalFixtures,
  summaryGroundingFixtures,
} from "./phase2-fixtures";

describe("Phase 2 evaluation metrics", () => {
  it("computes retrieval Recall@5 and graded nDCG@10 from recorded rankings", () => {
    const result = evaluateRetrieval(retrievalFixtures);

    expect(result.recallAt5).toBe(1);
    expect(result.ndcgAt10).toBeGreaterThan(0.8);
    expect(result.perQuery).toHaveLength(2);
  });

  it("normalizes nDCG against the ideal ranking", () => {
    expect(ndcgAtK([{ id: "b" }, { id: "a" }], { a: 3, b: 1 }, 10)).toBeLessThan(1);
    expect(ndcgAtK([{ id: "a" }, { id: "b" }], { a: 3, b: 1 }, 10)).toBe(1);
  });

  it("separates citation precision from claim support", () => {
    const result = evaluateCitations(citationFixtures);

    expect(result.precision).toBeCloseTo(2 / 3);
    expect(result.support).toBe(1);
    expect(result.claimCoverage).toBeCloseTo(2 / 3);
  });

  it("scores abstention decisions against the labeled answerability", () => {
    expect(evaluateAbstention(abstentionFixtures)).toBeCloseTo(2 / 3);
  });

  it("reports both supported summary claims and evidence coverage", () => {
    const result = evaluateSummaryGrounding(summaryGroundingFixtures);

    expect(result.claimSupport).toBeCloseTo(2 / 3);
    expect(result.evidenceCoverage).toBe(1);
  });

  it("measures ranking quality and source/topic diversity independently", () => {
    const result = evaluateRanking(rankingFixtures);

    expect(result.ndcgAt10).toBe(1);
    expect(result.diversityAt10).toBeCloseTo((3 / 4 + 2 / 3) / 2);
    expect(result.perCase[1].diversityAt10).toBeCloseTo(2 / 3);
  });
});
