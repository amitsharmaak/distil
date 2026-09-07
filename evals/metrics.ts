/**
 * Deterministic, dependency-free metrics used by the Phase 2 evaluation suite.
 *
 * All functions are pure and operate on recorded predictions. They are safe to
 * use from the nightly runner, unit tests, or a future evaluation service.
 */

export interface RankedResult {
  id: string;
  /** Graded relevance supplied by a prediction or a ranking label. */
  relevance?: number;
  /** A source/topic bucket used by diversity evaluation. */
  group?: string;
}

export interface RetrievalCase {
  id: string;
  relevant: string[] | Record<string, number>;
  retrieved: RankedResult[];
}

export interface RetrievalMetrics {
  recallAt5: number;
  ndcgAt10: number;
  perQuery: Array<{ id: string; recallAt5: number; ndcgAt10: number }>;
}

export interface CitationPassage {
  id: string;
  text: string;
}

export interface Citation {
  id: string;
  passageId: string;
  excerpt: string;
}

export interface CitationClaim {
  id: string;
  /** Empty means the claim should not be presented as evidence-backed. */
  requiredPassageIds: string[];
  citationIds: string[];
}

export interface CitationCase {
  id: string;
  passages: CitationPassage[];
  citations: Citation[];
  claims: CitationClaim[];
}

export interface CitationMetrics {
  /** Valid citations / all citations emitted by the answer. */
  precision: number;
  /** Answerable claims with at least one valid citation / answerable claims. */
  support: number;
  /** Answerable claims with at least one valid citation / all claims. */
  claimCoverage: number;
  perCase: Array<{ id: string; precision: number; support: number; claimCoverage: number }>;
}

export interface AbstentionCase {
  id: string;
  shouldAbstain: boolean;
  predictedAbstain: boolean;
}

export interface SummaryClaim {
  id: string;
  evidenceIds: string[];
}

export interface SummaryGroundingCase {
  id: string;
  requiredEvidenceIds: string[];
  claims: SummaryClaim[];
}

export interface SummaryGroundingMetrics {
  claimSupport: number;
  evidenceCoverage: number;
  perCase: Array<{ id: string; claimSupport: number; evidenceCoverage: number }>;
}

export interface RankingCase {
  id: string;
  ranking: RankedResult[];
  relevance: Record<string, number>;
}

export interface RankingMetrics {
  ndcgAt10: number;
  diversityAt10: number;
  perCase: Array<{ id: string; ndcgAt10: number; diversityAt10: number }>;
}

function relevanceMap(values: string[] | Record<string, number>): Map<string, number> {
  if (Array.isArray(values)) return new Map(values.map((id) => [id, 1]));
  return new Map(Object.entries(values));
}

function dcg(ranked: RankedResult[], labels: Map<string, number>, k: number): number {
  return ranked.slice(0, k).reduce((sum, result, index) => {
    const relevance = labels.get(result.id) ?? 0;
    return sum + (2 ** relevance - 1) / Math.log2(index + 2);
  }, 0);
}

export function ndcgAtK(
  ranked: RankedResult[],
  labels: string[] | Record<string, number>,
  k: number
): number {
  if (k <= 0) return 0;
  const labelMap = relevanceMap(labels);
  const ideal = [...labelMap.entries()]
    .sort(([, left], [, right]) => right - left)
    .map(([id, relevance]) => ({ id, relevance }));
  const idealDcg = dcg(ideal, labelMap, k);
  return idealDcg === 0 ? 0 : dcg(ranked, labelMap, k) / idealDcg;
}

export function evaluateRetrieval(cases: RetrievalCase[], k = 5): RetrievalMetrics {
  const perQuery = cases.map((testCase) => {
    const labels = relevanceMap(testCase.relevant);
    const relevantCount = labels.size;
    const found = new Set(testCase.retrieved.slice(0, k).map((result) => result.id));
    const hits = [...labels.keys()].filter((id) => found.has(id)).length;
    return {
      id: testCase.id,
      recallAt5: relevantCount === 0 ? 0 : hits / relevantCount,
      ndcgAt10: ndcgAtK(testCase.retrieved, testCase.relevant, 10),
    };
  });
  return {
    recallAt5: average(perQuery.map((result) => result.recallAt5)),
    ndcgAt10: average(perQuery.map((result) => result.ndcgAt10)),
    perQuery,
  };
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function excerptMatches(excerpt: string, passage: string): boolean {
  const expected = normalize(excerpt);
  return expected.length > 0 && normalize(passage).includes(expected);
}

export function evaluateCitations(cases: CitationCase[]): CitationMetrics {
  const perCase = cases.map((testCase) => {
    const passages = new Map(testCase.passages.map((passage) => [passage.id, passage.text]));
    const citations = new Map(testCase.citations.map((citation) => [citation.id, citation]));
    const validCitationIds = new Set(
      testCase.citations
        .filter(
          (citation) =>
            passages.has(citation.passageId) &&
            excerptMatches(citation.excerpt, passages.get(citation.passageId)!)
        )
        .map((citation) => citation.id)
    );
    const validCitations = [...validCitationIds].length;
    const precision =
      testCase.citations.length === 0 ? 1 : validCitations / testCase.citations.length;
    const answerable = testCase.claims.filter((claim) => claim.requiredPassageIds.length > 0);
    const supported = answerable.filter((claim) =>
      claim.citationIds.some((citationId) => {
        if (!validCitationIds.has(citationId)) return false;
        const citation = citations.get(citationId)!;
        return claim.requiredPassageIds.includes(citation.passageId);
      })
    ).length;
    return {
      id: testCase.id,
      precision,
      support: answerable.length === 0 ? 1 : supported / answerable.length,
      claimCoverage: testCase.claims.length === 0 ? 1 : supported / testCase.claims.length,
    };
  });
  return {
    precision: average(perCase.map((result) => result.precision)),
    support: average(perCase.map((result) => result.support)),
    claimCoverage: average(perCase.map((result) => result.claimCoverage)),
    perCase,
  };
}

export function evaluateAbstention(cases: AbstentionCase[]): number {
  if (cases.length === 0) return 0;
  return (
    cases.filter((testCase) => testCase.shouldAbstain === testCase.predictedAbstain).length /
    cases.length
  );
}

export function evaluateSummaryGrounding(cases: SummaryGroundingCase[]): SummaryGroundingMetrics {
  const perCase = cases.map((testCase) => {
    const required = new Set(testCase.requiredEvidenceIds);
    const validClaims = testCase.claims.filter((claim) =>
      claim.evidenceIds.some((id) => required.has(id))
    );
    const citedEvidence = new Set(
      validClaims.flatMap((claim) => claim.evidenceIds.filter((id) => required.has(id)))
    );
    return {
      id: testCase.id,
      claimSupport: testCase.claims.length === 0 ? 1 : validClaims.length / testCase.claims.length,
      evidenceCoverage: required.size === 0 ? 1 : citedEvidence.size / required.size,
    };
  });
  return {
    claimSupport: average(perCase.map((result) => result.claimSupport)),
    evidenceCoverage: average(perCase.map((result) => result.evidenceCoverage)),
    perCase,
  };
}

export function evaluateRanking(cases: RankingCase[], k = 10): RankingMetrics {
  const perCase = cases.map((testCase) => {
    const visible = testCase.ranking.slice(0, k);
    const groups = new Set(visible.map((result) => result.group).filter(Boolean));
    return {
      id: testCase.id,
      ndcgAt10: ndcgAtK(testCase.ranking, testCase.relevance, k),
      diversityAt10: visible.length === 0 ? 0 : groups.size / visible.length,
    };
  });
  return {
    ndcgAt10: average(perCase.map((result) => result.ndcgAt10)),
    diversityAt10: average(perCase.map((result) => result.diversityAt10)),
    perCase,
  };
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
