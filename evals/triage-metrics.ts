/**
 * Pure metrics for the capture-triage eval (`evals/triage-eval.ts`).
 *
 * Dependency-free so the unit test can exercise every computation without a model, database or
 * network. The eval script maps each triaged page to a `TriageEvalRecord` and reports from here.
 */

export type TruthLabel = "junk" | "ok";
export type PriorityBand = "high" | "medium" | "low";

export interface TriageEvalRecord {
  /** Item id, or the fixture name for synthetic pages. */
  id: string;
  title: string;
  source: "fixture" | "db";
  truth: TruthLabel;
  /** Model kind ("content" or a junk kind); undefined when the call failed. */
  kind?: string;
  priorityScore?: number;
  /** Whether `shouldRejectAsJunk` (with its guards) would reject the capture. */
  rejected: boolean;
  latencyMs?: number;
  /** Failure category when the call failed; triage fails open, so the capture is kept. */
  error?: string;
}

export interface Confusion {
  /** Truth junk, predicted junk. */
  truePositive: number;
  /** Truth ok, predicted junk: a false reject. */
  falsePositive: number;
  /** Truth ok, predicted ok. */
  trueNegative: number;
  /** Truth junk, predicted ok: junk that slips through. */
  falseNegative: number;
}

export function confusion(
  records: readonly TriageEvalRecord[],
  predictedJunk: (record: TriageEvalRecord) => boolean
): Confusion {
  const result: Confusion = {
    truePositive: 0,
    falsePositive: 0,
    trueNegative: 0,
    falseNegative: 0,
  };
  for (const record of records) {
    const junk = predictedJunk(record);
    if (record.truth === "junk") {
      if (junk) result.truePositive += 1;
      else result.falseNegative += 1;
    } else if (junk) {
      result.falsePositive += 1;
    } else {
      result.trueNegative += 1;
    }
  }
  return result;
}

/** The guarded verdict: what the capture processor would actually reject. */
export const guardedJunk = (record: TriageEvalRecord): boolean => record.rejected;

/** The raw model verdict: any kind other than "content". Failed calls count as not junk. */
export const rawModelJunk = (record: TriageEvalRecord): boolean =>
  record.kind !== undefined && record.kind !== "content";

/** "ok" pages the guarded verdict would reject. The eval fails when this is non-empty. */
export function falseRejects(
  records: readonly TriageEvalRecord[]
): Array<Pick<TriageEvalRecord, "id" | "title" | "source" | "kind">> {
  return records
    .filter((record) => record.truth === "ok" && record.rejected)
    .map(({ id, title, source, kind }) => ({ id, title, source, kind }));
}

export function kindDistribution(records: readonly TriageEvalRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    const key = record.kind ?? "error";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export const SCORE_BUCKETS = ["0-19", "20-39", "40-59", "60-79", "80-100"] as const;
export type ScoreBucket = (typeof SCORE_BUCKETS)[number];

export function scoreBucket(score: number): ScoreBucket {
  const clamped = Math.min(100, Math.max(0, score));
  return SCORE_BUCKETS[Math.min(4, Math.floor(clamped / 20))];
}

export function scoreHistogram(scores: readonly number[]): Record<ScoreBucket, number> {
  const histogram = Object.fromEntries(SCORE_BUCKETS.map((bucket) => [bucket, 0])) as Record<
    ScoreBucket,
    number
  >;
  for (const score of scores) {
    if (Number.isFinite(score)) histogram[scoreBucket(score)] += 1;
  }
  return histogram;
}

/** H/M/L split using the caller's score→priority mapping (`scoreToPriority`). */
export function prioritySplit(
  scores: readonly number[],
  toPriority: (score: number) => PriorityBand
): Record<PriorityBand, number> {
  const split: Record<PriorityBand, number> = { high: 0, medium: 0, low: 0 };
  for (const score of scores) {
    if (Number.isFinite(score)) split[toPriority(score)] += 1;
  }
  return split;
}

/** Nearest-rank percentile (p in 0..100); undefined for an empty list. */
export function percentile(values: readonly number[], p: number): number | undefined {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  const bounded = Math.min(100, Math.max(0, p));
  const rank = Math.max(1, Math.ceil((bounded / 100) * sorted.length));
  return sorted[rank - 1];
}

/** Per-call cost from a before/after reading of the in-memory usage tracker. */
export function costPerCall(totalUsd: number, calls: number): number | undefined {
  if (calls <= 0 || !Number.isFinite(totalUsd)) return undefined;
  return totalUsd / calls;
}
