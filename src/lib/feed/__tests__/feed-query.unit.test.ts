import {
  FeedQueryError,
  PostgresFeedQuery,
  decodeFeedCursor,
  decayAffinity,
  encodeFeedCursor,
  explainFeedRank,
  reserveTopTenDiversity,
  resurfacingEligibility,
} from "../feed-query";
import { createAuthContext } from "@/lib/contracts/tenant-context";

const context = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000001",
  actorKind: "user",
  actorId: "10000000-0000-4000-8000-000000000001",
  requestId: "30000000-0000-4000-8000-000000000001",
});

function fakeFeedSql(rows: Record<string, unknown>[]) {
  const sql = ((strings: TemplateStringsArray) => {
    const text = strings.join("?");
    return Promise.resolve(text.includes("SELECT i.*, s.summary") ? rows : []);
  }) as unknown as {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]>;
    array(values: string[]): string[];
  };
  sql.array = (values) => values;
  return sql;
}

function feedRow(id: string, score = 61.234567): Record<string, unknown> {
  return {
    id,
    title: `Item ${id}`,
    summary: "Summary",
    source_type: "manual",
    content_type: "article",
    topics: ["systems"],
    url: `https://example.test/${id}`,
    priority: "medium",
    is_read: false,
    created_at: "2026-09-06T00:00:00.000Z",
    processing_status: "ready",
    feed_affinity_score: 1.5,
    feed_rank_score: score,
  };
}

const now = new Date("2026-09-07T00:00:00.000Z");
const base = {
  priority: "medium" as const,
  createdAt: "2026-09-06T00:00:00.000Z",
};

describe("feed ranking contracts", () => {
  it("makes manual high and low priorities absolute ordering tiers with stable reasons", () => {
    const high = explainFeedRank({ ...base, manualPriority: "high" }, "for_you", now);
    const low = explainFeedRank({ ...base, manualPriority: "low" }, "for_you", now);
    const learned = explainFeedRank({ ...base, aiPriorityScore: 99 }, "for_you", now);
    expect(high.score).toBeGreaterThan(learned.score);
    expect(low.score).toBeLessThan(learned.score);
    expect(low.reasons).toEqual(["Manual priority: low", "Recent items receive a small tie-break"]);
  });

  it("uses chronological order without an implicit personalization score", () => {
    expect(explainFeedRank({ ...base, manualPriority: "high" }, "recent", now)).toEqual({
      sort: "recent",
      score: new Date(base.createdAt).getTime(),
      reasons: ["Chronological order"],
      components: { itemPriority: "medium" },
    });
  });

  it("uses a 60-day half-life for explicit-signal affinity without overriding manual priority", () => {
    expect(decayAffinity(8, "2026-07-09T00:00:00.000Z", now)).toBeCloseTo(4, 6);
    const personalized = explainFeedRank({ ...base, affinityScore: 7 }, "for_you", now);
    expect(personalized.reasons).toContain(
      "Personalized from explicit feedback and reading actions"
    );
    expect(personalized.components.affinityScore).toBe(7);
    expect(
      explainFeedRank({ ...base, manualPriority: "low", affinityScore: 999 }, "for_you", now).score
    ).toBeLessThan(personalized.score);
  });

  it("reserves two top-ten positions for a relevant alternative source when available", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      id: `item-${index}`,
      sourceType: (index >= 10 ? "publisher" : "manual") as "publisher" | "manual",
      topics: ["engineering"],
    }));
    const diversified = reserveTopTenDiversity(rows);
    expect(diversified.slice(0, 10).filter((item) => item.sourceType === "publisher")).toHaveLength(
      2
    );
    expect(new Set(diversified.map((item) => item.id)).size).toBe(rows.length);
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

  it("explains baseline priorities and rejects every remaining resurfacing disqualifier", () => {
    expect(explainFeedRank({ ...base }, "priority", now).reasons).toEqual([
      "Item priority: medium",
      "Recent items receive a small tie-break",
    ]);
    expect(explainFeedRank({ ...base, priority: "high" }, "priority", now).score).toBeGreaterThan(
      explainFeedRank({ ...base, priority: "low" }, "priority", now).score
    );
    expect(
      explainFeedRank({ ...base, manualPriority: "medium" }, "for_you", now).score
    ).toBeGreaterThan(explainFeedRank({ ...base }, "for_you", now).score);
    const candidate = {
      isRead: false,
      isInCollection: false,
      processingStatus: "ready" as const,
      lastOpenedAt: "2026-08-01T00:00:00Z",
    };
    expect(
      resurfacingEligibility({ ...candidate, archivedAt: "2026-01-01T00:00:00Z" }, now)
    ).toMatchObject({
      reason: "archived",
    });
    expect(
      resurfacingEligibility({ ...candidate, processingStatus: "processing" }, now)
    ).toMatchObject({
      reason: "not_ready",
    });
    expect(resurfacingEligibility({ ...candidate, isRead: true }, now)).toMatchObject({
      reason: "not_unread_or_saved",
    });
  });

  it("keeps existing ranking order where diversity cannot reserve alternatives", () => {
    const rows = Array.from({ length: 11 }, (_, index) => ({
      id: `item-${index}`,
      sourceType: "manual" as const,
      topics: [],
    }));
    expect(reserveTopTenDiversity(rows)).toEqual(rows);
    expect(reserveTopTenDiversity(rows.slice(0, 10))).toEqual(rows.slice(0, 10));
    expect(
      decodeFeedCursor(
        encodeFeedCursor({ v: 1, sort: "recent", createdAt: base.createdAt, id: "r" }),
        "recent"
      )
    ).toMatchObject({ id: "r" });
    expect(
      decodeFeedCursor(
        encodeFeedCursor({ v: 1, sort: "recent", createdAt: "not-a-date", id: "r" }),
        "recent"
      )
    ).toBeUndefined();
  });

  it("builds deterministic PostgreSQL keyset pages for personalized, priority, and chronological sorts", async () => {
    const personalized = new PostgresFeedQuery(
      fakeFeedSql([feedRow("item-2"), feedRow("item-1", 60.123456)]) as never,
      context
    );
    const first = await personalized.list({
      sort: "for_you",
      limit: 1,
      personalizationEnabled: true,
      read: false,
      archive: "exclude",
      topics: ["systems"],
      sources: ["manual"],
      contentTypes: ["article"],
      priorities: ["medium"],
      collectionIds: ["collection-1"],
      dateFrom: "2026-09-01T00:00:00.000Z",
      dateTo: "2026-09-07T00:00:00.000Z",
      now,
    });
    expect(first).toMatchObject({ items: [{ id: "item-2", rank: { score: 61.234567 } }] });
    expect(first.nextCursor).toEqual(expect.any(String));

    const priority = new PostgresFeedQuery(fakeFeedSql([feedRow("priority")]) as never, context);
    await expect(
      priority.list({
        sort: "priority",
        cursor: encodeFeedCursor({
          v: 1,
          sort: "priority",
          score: 61.234567,
          createdAt: base.createdAt,
          id: "item-2",
        }),
        now,
      })
    ).resolves.toMatchObject({ items: [{ id: "priority" }] });

    const recent = new PostgresFeedQuery(fakeFeedSql([feedRow("recent")]) as never, context);
    await expect(
      recent.list({
        sort: "recent",
        cursor: encodeFeedCursor({ v: 1, sort: "recent", createdAt: base.createdAt, id: "item-1" }),
        archive: "only",
        now,
      })
    ).resolves.toMatchObject({ items: [{ id: "recent", rank: { sort: "recent" } }] });

    const complete = new PostgresFeedQuery(
      fakeFeedSql([{ ...feedRow("complete"), ai_priority_score: 77 }]) as never,
      context
    );
    await expect(
      complete.list({ sort: "for_you", archive: "include", personalizationEnabled: true, now })
    ).resolves.toMatchObject({ items: [{ id: "complete" }] });
    await expect(new PostgresFeedQuery(fakeFeedSql([]) as never, context).list()).resolves.toEqual({
      items: [],
    });
  });

  it("fails closed for malformed keyset cursors before querying PostgreSQL", async () => {
    const query = new PostgresFeedQuery(fakeFeedSql([]) as never, context);
    await expect(query.list({ cursor: "invalid" })).rejects.toMatchObject({
      code: "INVALID_CURSOR",
    } satisfies Partial<FeedQueryError>);
  });
});
