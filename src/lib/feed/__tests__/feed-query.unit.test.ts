import {
  decodeFeedCursor,
  encodeFeedCursor,
  explainFeedRank,
  resurfacingEligibility,
} from "../feed-query";

const now = new Date("2026-09-07T00:00:00.000Z");
const base = {
  priority: "medium" as const,
  createdAt: "2026-09-06T00:00:00.000Z",
};

describe("feed ranking contracts", () => {
  it("makes a manual priority an absolute ordering tier with stable reasons", () => {
    const manual = explainFeedRank({ ...base, manualPriority: "low" }, "for_you", now);
    const learned = explainFeedRank({ ...base, aiPriorityScore: 99 }, "for_you", now);
    expect(manual.score).toBeGreaterThan(learned.score);
    expect(manual.reasons).toEqual([
      "Manual priority: low",
      "Recent items receive a small tie-break",
    ]);
  });

  it("uses chronological order without an implicit personalization score", () => {
    expect(explainFeedRank({ ...base, manualPriority: "high" }, "recent", now)).toEqual({
      sort: "recent",
      score: new Date(base.createdAt).getTime(),
      reasons: ["Chronological order"],
      components: { itemPriority: "medium" },
    });
  });

  it("round-trips opaque cursors and rejects incompatible cursors", () => {
    const cursor = encodeFeedCursor({
      v: 1,
      sort: "for_you",
      score: 42.1,
      createdAt: base.createdAt,
      id: "item-1",
    });
    expect(decodeFeedCursor(cursor, "for_you")).toMatchObject({ id: "item-1", score: 42.1 });
    expect(decodeFeedCursor(cursor, "recent")).toBeUndefined();
    expect(decodeFeedCursor("not-a-cursor", "for_you")).toBeUndefined();
  });

  it("applies the revisit stale window and display/dismiss cooldowns deterministically", () => {
    const candidate = {
      isRead: false,
      isInCollection: false,
      processingStatus: "ready" as const,
      lastOpenedAt: "2026-08-20T00:00:00Z",
    };
    expect(resurfacingEligibility(candidate, now)).toEqual({
      eligible: true,
      reason: "Worth revisiting",
    });
    expect(
      resurfacingEligibility({ ...candidate, lastResurfacedAt: "2026-08-20T00:00:00Z" }, now)
    ).toEqual({ eligible: false, reason: "resurfacing_cooldown" });
    expect(
      resurfacingEligibility({ ...candidate, lastDismissedAt: "2026-07-01T00:00:00Z" }, now)
    ).toEqual({ eligible: false, reason: "dismissal_cooldown" });
    expect(
      resurfacingEligibility({ ...candidate, lastOpenedAt: "2026-09-01T00:00:00Z" }, now)
    ).toEqual({ eligible: false, reason: "not_stale" });
  });
});
