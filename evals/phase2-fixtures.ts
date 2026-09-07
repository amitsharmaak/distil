import type {
  AbstentionCase,
  CitationCase,
  RankingCase,
  RetrievalCase,
  SummaryGroundingCase,
} from "./metrics";

export const retrievalFixtures: RetrievalCase[] = [
  {
    id: "retrieval-rag",
    relevant: { "rag-chunk-1": 3, "rag-chunk-2": 2 },
    retrieved: [
      { id: "noise-chunk", relevance: 0 },
      { id: "rag-chunk-1" },
      { id: "rag-chunk-2" },
      { id: "old-rag-chunk" },
    ],
  },
  {
    id: "retrieval-security",
    relevant: ["security-chunk-1"],
    retrieved: [{ id: "security-chunk-1" }, { id: "noise-chunk" }],
  },
];

export const citationFixtures: CitationCase[] = [
  {
    id: "answer-grounded",
    passages: [
      {
        id: "p1",
        text: "The migration keeps the previous valid artifact while regeneration runs.",
      },
      { id: "p2", text: "Keyword retrieval remains available when embeddings are unavailable." },
    ],
    citations: [
      { id: "c1", passageId: "p1", excerpt: "keeps the previous valid artifact" },
      { id: "c2", passageId: "p2", excerpt: "Keyword retrieval remains available" },
      { id: "c3", passageId: "p1", excerpt: "This sentence is not in the passage" },
    ],
    claims: [
      { id: "claim-1", requiredPassageIds: ["p1"], citationIds: ["c1"] },
      { id: "claim-2", requiredPassageIds: ["p2"], citationIds: ["c2"] },
      { id: "claim-3", requiredPassageIds: [], citationIds: [] },
    ],
  },
];

export const abstentionFixtures: AbstentionCase[] = [
  { id: "answerable", shouldAbstain: false, predictedAbstain: false },
  { id: "insufficient-evidence", shouldAbstain: true, predictedAbstain: true },
  { id: "hallucinated-answer", shouldAbstain: true, predictedAbstain: false },
];

export const summaryGroundingFixtures: SummaryGroundingCase[] = [
  {
    id: "summary-with-evidence",
    requiredEvidenceIds: ["p1", "p2"],
    claims: [
      { id: "claim-1", evidenceIds: ["p1"] },
      { id: "claim-2", evidenceIds: ["p2"] },
      { id: "claim-unsupported", evidenceIds: ["not-a-passage"] },
    ],
  },
];

export const rankingFixtures: RankingCase[] = [
  {
    id: "balanced-ranking",
    relevance: { a: 3, b: 2, c: 1, d: 0 },
    ranking: [
      { id: "a", group: "ai" },
      { id: "b", group: "security" },
      { id: "c", group: "databases" },
      { id: "d", group: "ai" },
    ],
  },
  {
    id: "source-dominated-ranking",
    relevance: { e: 3, f: 2, g: 1 },
    ranking: [
      { id: "e", group: "same-source" },
      { id: "f", group: "same-source" },
      { id: "g", group: "other-source" },
    ],
  },
];
