import {
  FeedQueryError,
  PostgresFeedQuery,
  decodeFeedCursor,
  decayAffinity,
  encodeFeedCursor,
  explainFeedRank,
  feedSearchLikePattern,
  feedSearchTsQuery,
  normalizeFeedSite,
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

type Fragment = { text: string };
const isFragment = (value: unknown): value is Fragment =>
  typeof value === "object" && value !== null && "text" in value;

/**
 * Nested fragments and `sql.unsafe` column lists are spliced into the recorded
 * statement text, so assertions cover the SQL PostgreSQL would receive.
 */
function fakeFeedSql(rows: Record<string, unknown>[]) {
  const statements: string[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce<string>(
      (acc, part, index) =>
        index === 0
          ? part
          : `${acc}${isFragment(values[index - 1]) ? (values[index - 1] as Fragment).text : "?"}${part}`,
      ""
    );
    const isStatement = text.includes("FROM items i");
    if (isStatement) statements.push(text);
    const result = Promise.resolve(isStatement ? rows : []) as Promise<Record<string, unknown>[]> &
      Fragment;
    result.text = text;
    return result;
  }) as unknown as {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]>;
    array(values: string[]): string[];
    unsafe(text: string): Fragment;
    statements: string[];
  };
  sql.array = (values) => values;
  sql.unsafe = (text) => ({ text });
  sql.statements = statements;
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
      reason: "already_read",
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

  it("computes explicit-signal affinity once per row through a LATERAL join", async () => {
    const personalized = fakeFeedSql([feedRow("lateral")]);
    await new PostgresFeedQuery(personalized as never, context).list({
      sort: "for_you",
      personalizationEnabled: true,
      cursor: encodeFeedCursor({
        v: 1,
        sort: "for_you",
        score: 61.234567,
        createdAt: base.createdAt,
        id: "item-2",
      }),
      now,
    });
    const statement = personalized.statements[0];
    expect(statement.match(/LEFT JOIN LATERAL/g)).toHaveLength(1);
    expect(statement.match(/FROM item_events e/g)).toHaveLength(1);
    // SELECT list, cursor predicate (three comparisons) and ORDER BY all read the joined value.
    expect(
      (statement.match(/COALESCE\(affinity_signal\.score, 0\)/g) ?? []).length
    ).toBeGreaterThanOrEqual(5);
    expect(statement.indexOf("LEFT JOIN LATERAL")).toBeLessThan(statement.indexOf("WHERE "));

    const chronological = fakeFeedSql([feedRow("plain")]);
    await new PostgresFeedQuery(chronological as never, context).list({
      sort: "recent",
      personalizationEnabled: true,
      now,
    });
    expect(chronological.statements[0]).not.toContain("LATERAL");
    expect(chronological.statements[0]).not.toContain("item_events");
  });

  it("adds thumbnail and reading time while keeping article bodies out of feed payloads", async () => {
    const sql = fakeFeedSql([
      {
        ...feedRow("summary-only"),
        full_content: "<p>the whole body</p>",
        thumbnail_url: "https://example.test/image.jpg",
        reading_minutes: 8,
      },
    ]);
    const page = await new PostgresFeedQuery(sql as never, context).list({
      sort: "for_you",
      personalizationEnabled: true,
      now,
    });
    expect(sql.statements).toHaveLength(1);
    const statement = sql.statements[0];
    expect(statement).toContain("SELECT i.id,i.title,i.summary,");
    expect(statement).toContain("s.summary AS ai_summary_text,");
    expect(statement).toContain("i.thumbnail_url");
    expect(statement).toContain(
      "CEIL(char_length(COALESCE(NULLIF(page.feed_body, ''), page.summary, '')) / 1200.0)::integer AS reading_minutes"
    );
    // The estimate runs in the outer SELECT, after the inner ORDER BY ... LIMIT.
    expect(statement.indexOf("AS reading_minutes")).toBeLessThan(statement.indexOf("FROM ("));
    expect(statement.indexOf("LIMIT")).toBeLessThan(statement.indexOf(") page"));
    // The body is carried once as a reference and read only inside the estimate,
    // never returned as a column.
    expect(statement.match(/i\.full_content/g)).toHaveLength(1);
    expect(statement.match(/feed_body/g)).toHaveLength(2);
    expect(statement).not.toContain("i.*");
    for (const column of [
      "extracted_links",
      "detected_media",
      "content_classification",
      "search_vector",
    ]) {
      expect(statement).not.toContain(column);
    }
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).not.toHaveProperty("fullContent");
    expect(page.items[0]).toMatchObject({
      id: "summary-only",
      title: "Item summary-only",
      thumbnailUrl: "https://example.test/image.jpg",
      readingMinutes: 8,
    });
    expect(JSON.stringify(page)).not.toContain("the whole body");
  });

  it("filters stale resurfacing candidates in PostgreSQL using the 14-day rule", async () => {
    const sql = fakeFeedSql([feedRow("stale")]);
    await new PostgresFeedQuery(sql as never, context).list({
      sort: "recent",
      resurface: "stale",
      now,
    });

    expect(sql.statements[0]).toContain("i.is_read=false");
    expect(sql.statements[0]).toContain("i.processing_status='ready'");
    expect(sql.statements[0]).toContain("i.last_opened_at IS NOT NULL");
    expect(sql.statements[0]).toContain("i.last_opened_at <= ?::timestamptz - INTERVAL '14 days'");
    expect(sql.statements[0]).not.toContain(["collec", "tion_items"].join(""));
  });

  it("fails closed for malformed keyset cursors before querying PostgreSQL", async () => {
    const query = new PostgresFeedQuery(fakeFeedSql([]) as never, context);
    await expect(query.list({ cursor: "invalid" })).rejects.toMatchObject({
      code: "INVALID_CURSOR",
    } satisfies Partial<FeedQueryError>);
  });

  it("never references the feed-search columns unless a request asks for search or a site", async () => {
    const sql = fakeFeedSql([feedRow("plain")]);
    await new PostgresFeedQuery(sql as never, context).list({ sort: "for_you", now });
    expect(sql.statements[0]).not.toContain("feed_search_vector");
    expect(sql.statements[0]).not.toContain("i.site");
    expect(sql.statements[0]).not.toContain("ILIKE");
    // The projection carries the area (life-areas is applied); only the filter is on request.
    expect(sql.statements[0]).not.toContain("COALESCE(i.manual_area, i.area)");
  });

  it("filters by the effective area: Amit's correction first, then the AI's", async () => {
    const sql = fakeFeedSql([feedRow("work")]);
    await new PostgresFeedQuery(sql as never, context).list({
      areas: ["work", "learning"],
      sort: "recent",
      now,
    });
    expect(sql.statements[0]).toContain("COALESCE(i.manual_area, i.area) = ANY(?)");
  });

  it("filters by text and site and orders a search by relevance", async () => {
    const sql = fakeFeedSql([feedRow("hit", 1.060793)]);
    const page = await new PostgresFeedQuery(sql as never, context).list({
      search: "machine learni",
      sites: ["twitter.com"],
      sort: "relevance",
      now,
    });
    const statement = sql.statements[0];
    expect(statement).toContain("i.site = ANY(?)");
    expect(statement).toContain("i.feed_search_vector @@ to_tsquery('english', ?)");
    expect(statement).toContain("i.title ILIKE ? ESCAPE '\\'");
    expect(statement).toContain("i.author ILIKE ? ESCAPE '\\'");
    expect(statement).toContain("i.publication ILIKE ? ESCAPE '\\'");
    expect(statement).toContain("ts_rank(i.feed_search_vector, to_tsquery('english', ?))");
    expect(statement).not.toContain("affinity_signal");
    expect(page.items[0].rank).toEqual({
      sort: "relevance",
      score: 1.060793,
      reasons: ["Matches your search"],
      components: { manualPriority: undefined, itemPriority: "medium" },
    });
  });

  it("keeps a search's own sort when the caller picks one", async () => {
    const sql = fakeFeedSql([feedRow("hit")]);
    await new PostgresFeedQuery(sql as never, context).list({
      search: "rust",
      sort: "recent",
      now,
    });
    expect(sql.statements[0]).toContain("i.feed_search_vector @@");
    expect(sql.statements[0]).toContain("ORDER BY i.created_at DESC, i.id DESC");
    expect(sql.statements[0]).not.toContain("ts_rank");
  });

  it("falls back to substring matching when the search has no indexable term", async () => {
    const sql = fakeFeedSql([]);
    await new PostgresFeedQuery(sql as never, context).list({
      search: "the",
      sort: "relevance",
      now,
    });
    expect(sql.statements[0]).not.toContain("to_tsquery");
    expect(sql.statements[0]).toContain("i.title ILIKE ? ESCAPE '\\'");
  });
});

describe("feed ranking with a capture triage priority", () => {
  const daysBefore = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

  it("ranks a high item above a newer medium one under the priority sort", () => {
    // The priority buckets are 40 points apart and the recency tie-break is at most 10,
    // so a high item outranks any medium one regardless of age.
    for (const ageDays of [1, 5, 10, 30]) {
      const high = explainFeedRank(
        { priority: "high", createdAt: daysBefore(ageDays) },
        "priority",
        now
      );
      const newerMedium = explainFeedRank(
        { priority: "medium", createdAt: now.toISOString() },
        "priority",
        now
      );
      expect(high.score).toBeGreaterThan(newerMedium.score);
    }
  });

  it("ignores the learned score under the priority sort", () => {
    const withScore = explainFeedRank({ ...base, aiPriorityScore: 99 }, "priority", now);
    expect(withScore.score).toBe(explainFeedRank({ ...base }, "priority", now).score);
  });

  it("lets a manual low priority sink a high item", () => {
    const sunk = explainFeedRank(
      { ...base, priority: "high", manualPriority: "low" },
      "priority",
      now
    );
    const oldLow = explainFeedRank({ priority: "low", createdAt: daysBefore(60) }, "priority", now);
    expect(sunk.score).toBeLessThan(oldLow.score);
    expect(sunk.reasons[0]).toBe("Manual priority: low");
    const sunkForYou = explainFeedRank(
      { ...base, priority: "high", aiPriorityScore: 95, manualPriority: "low" },
      "for_you",
      now
    );
    expect(sunkForYou.score).toBeLessThan(
      explainFeedRank({ priority: "low", createdAt: daysBefore(60) }, "for_you", now).score
    );
  });

  it("uses the stored priority score for for_you when present and the bucket otherwise", () => {
    const scored = explainFeedRank({ ...base, aiPriorityScore: 80 }, "for_you", now);
    const bucket = explainFeedRank({ ...base }, "for_you", now);
    expect(scored.score - bucket.score).toBeCloseTo(80 - 50, 5);
    expect(scored.reasons[0]).toBe("Current baseline priority score");
    expect(bucket.reasons[0]).toBe("Item priority: medium");
  });

  it("reads the bucket under priority and the stored score under for_you in PostgreSQL", async () => {
    const bucketCase = "CASE i.priority WHEN 'high' THEN 90 WHEN 'medium' THEN 50 ELSE 20 END";
    const prioritySql = fakeFeedSql([feedRow("priority")]);
    await new PostgresFeedQuery(prioritySql as never, context).list({ sort: "priority", now });
    expect(prioritySql.statements[0]).toContain(bucketCase);
    expect(prioritySql.statements[0]).not.toContain("COALESCE(i.ai_priority_score");
    expect(prioritySql.statements[0]).toContain("WHEN i.manual_priority='low' THEN -100");

    const forYouSql = fakeFeedSql([feedRow("for-you")]);
    await new PostgresFeedQuery(forYouSql as never, context).list({ sort: "for_you", now });
    expect(forYouSql.statements[0]).toContain(`COALESCE(i.ai_priority_score, ${bucketCase})`);
  });
});

describe("feed search input", () => {
  it("turns typed text into an all-terms tsquery whose last term is a prefix", () => {
    expect(feedSearchTsQuery("Machine learni")).toBe("'machine' & 'learni':*");
    expect(feedSearchTsQuery("  Rust  ")).toBe("'rust':*");
    expect(feedSearchTsQuery("Ünïcode 2026")).toBe("'ünïcode' & '2026':*");
  });

  it("strips every tsquery operator and quote the caller could inject", () => {
    expect(feedSearchTsQuery("zz' | !bb & (cc) <-> dd:*")).toBe("'zz' & 'bb' & 'cc' & 'dd':*");
    expect(feedSearchTsQuery("!!! ???")).toBeUndefined();
  });

  it("drops stop words so a stop-word-only query never reaches to_tsquery", () => {
    expect(feedSearchTsQuery("the")).toBeUndefined();
    expect(feedSearchTsQuery("the state of AI")).toBe("'state' & 'ai':*");
  });

  it("caps the number of terms", () => {
    expect(feedSearchTsQuery("a1 b2 c3 d4 e5 f6 g7 h8 i9 j10")?.split(" & ")).toHaveLength(8);
  });

  it("escapes LIKE wildcards so the substring match is literal", () => {
    expect(feedSearchLikePattern(" 50%_off\\ ")).toBe("%50\\%\\_off\\\\%");
  });

  it("normalizes site filters to the stored host form", () => {
    expect(normalizeFeedSite(" WWW.YouTube.com ")).toBe("youtube.com");
    expect(normalizeFeedSite("twitter.com")).toBe("x.com");
    expect(normalizeFeedSite("mobile.twitter.com")).toBe("x.com");
    expect(normalizeFeedSite("x.com")).toBe("x.com");
  });
});
