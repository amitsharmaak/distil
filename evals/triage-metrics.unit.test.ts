import { scoreToPriority } from "@/lib/ai/prioritize";

import {
  confusion,
  costPerCall,
  falseRejects,
  guardedJunk,
  kindDistribution,
  percentile,
  prioritySplit,
  rawModelJunk,
  scoreBucket,
  scoreHistogram,
  type TriageEvalRecord,
} from "./triage-metrics";

function record(overrides: Partial<TriageEvalRecord>): TriageEvalRecord {
  return {
    id: "r",
    title: "T",
    source: "fixture",
    truth: "ok",
    kind: "content",
    priorityScore: 50,
    rejected: false,
    ...overrides,
  };
}

const records: TriageEvalRecord[] = [
  record({ id: "a", truth: "junk", kind: "login_wall", rejected: true }),
  record({ id: "b", truth: "junk", kind: "paywall_stub", rejected: false }),
  record({ id: "c", truth: "junk", kind: "content", rejected: false }),
  record({ id: "d", truth: "ok", kind: "content", rejected: false }),
  record({ id: "e", truth: "ok", kind: "consent_wall", rejected: false, title: "Cookie essay" }),
  record({
    id: "f",
    truth: "ok",
    kind: "error_page",
    rejected: true,
    source: "db",
    title: "Brief",
  }),
  record({ id: "g", truth: "ok", kind: undefined, priorityScore: undefined, error: "timeout" }),
];

describe("triage metrics", () => {
  it("builds the guarded confusion table from the rejection decision", () => {
    expect(confusion(records, guardedJunk)).toEqual({
      truePositive: 1,
      falsePositive: 1,
      trueNegative: 3,
      falseNegative: 2,
    });
  });

  it("builds the raw-model confusion table from kind != content, failed calls as not junk", () => {
    expect(confusion(records, rawModelJunk)).toEqual({
      truePositive: 2,
      falsePositive: 2,
      trueNegative: 2,
      falseNegative: 1,
    });
  });

  it("lists false rejects with id, title, source and kind only", () => {
    expect(falseRejects(records)).toEqual([
      { id: "f", title: "Brief", source: "db", kind: "error_page" },
    ]);
    expect(falseRejects(records.filter((r) => r.id !== "f"))).toEqual([]);
  });

  it("counts kinds, with failed calls under error", () => {
    expect(kindDistribution(records)).toEqual({
      login_wall: 1,
      paywall_stub: 1,
      content: 2,
      consent_wall: 1,
      error_page: 1,
      error: 1,
    });
  });

  it("buckets scores at the 20-point edges and clamps out-of-range values", () => {
    expect(scoreBucket(0)).toBe("0-19");
    expect(scoreBucket(19)).toBe("0-19");
    expect(scoreBucket(20)).toBe("20-39");
    expect(scoreBucket(79)).toBe("60-79");
    expect(scoreBucket(80)).toBe("80-100");
    expect(scoreBucket(100)).toBe("80-100");
    expect(scoreBucket(140)).toBe("80-100");
    expect(scoreBucket(-5)).toBe("0-19");
    expect(scoreHistogram([0, 19, 20, 45, 61, 80, 100, Number.NaN])).toEqual({
      "0-19": 2,
      "20-39": 1,
      "40-59": 1,
      "60-79": 1,
      "80-100": 2,
    });
  });

  it("splits H/M/L at the scoreToPriority thresholds (>=70 high, >=40 medium)", () => {
    expect(prioritySplit([0, 39, 40, 69, 70, 100], scoreToPriority)).toEqual({
      high: 2,
      medium: 2,
      low: 2,
    });
  });

  it("computes nearest-rank percentiles", () => {
    const latencies = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    expect(percentile(latencies, 50)).toBe(500);
    expect(percentile(latencies, 95)).toBe(1000);
    expect(percentile([42], 95)).toBe(42);
    expect(percentile([300, 100, 200], 50)).toBe(200);
    expect(percentile([], 50)).toBeUndefined();
  });

  it("derives a per-call cost only when calls were made", () => {
    expect(costPerCall(0.5, 100)).toBeCloseTo(0.005);
    expect(costPerCall(0, 0)).toBeUndefined();
  });
});
