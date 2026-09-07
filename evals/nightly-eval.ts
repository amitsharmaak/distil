/**
 * Deterministic nightly entry point. Live provider calls remain opt-in via the
 * explicit `eval:live` command and are never triggered by a scheduled run.
 */

import { main as runLegacyEvaluation } from "./run-evals";
import {
  evaluateAbstention,
  evaluateCitations,
  evaluateRanking,
  evaluateRetrieval,
  evaluateSummaryGrounding,
} from "./metrics";
import {
  abstentionFixtures,
  citationFixtures,
  rankingFixtures,
  retrievalFixtures,
  summaryGroundingFixtures,
} from "./phase2-fixtures";

async function main(): Promise<void> {
  await runLegacyEvaluation();

  const retrieval = evaluateRetrieval(retrievalFixtures);
  const citations = evaluateCitations(citationFixtures);
  const abstention = evaluateAbstention(abstentionFixtures);
  const summaries = evaluateSummaryGrounding(summaryGroundingFixtures);
  const ranking = evaluateRanking(rankingFixtures);

  console.log("Phase 2 deterministic metrics");
  console.log(`  retrieval Recall@5: ${(retrieval.recallAt5 * 100).toFixed(1)}%`);
  console.log(`  retrieval nDCG@10: ${(retrieval.ndcgAt10 * 100).toFixed(1)}%`);
  console.log(`  citation precision: ${(citations.precision * 100).toFixed(1)}%`);
  console.log(`  citation support: ${(citations.support * 100).toFixed(1)}%`);
  console.log(`  abstention accuracy: ${(abstention * 100).toFixed(1)}%`);
  console.log(`  summary claim support: ${(summaries.claimSupport * 100).toFixed(1)}%`);
  console.log(`  summary evidence coverage: ${(summaries.evidenceCoverage * 100).toFixed(1)}%`);
  console.log(`  ranking nDCG@10: ${(ranking.ndcgAt10 * 100).toFixed(1)}%`);
  console.log(`  ranking diversity@10: ${(ranking.diversityAt10 * 100).toFixed(1)}%`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
