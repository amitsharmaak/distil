import { mapCapture, mapCaptureToken, mapItem } from "../mappers";

describe("PostgreSQL row mappers", () => {
  it("maps native PostgreSQL JSON, booleans, and timestamps to public item types", () => {
    const item = mapItem({
      id: "item-1",
      title: "Postgres",
      summary: "summary",
      full_content: null,
      source_type: "manual",
      content_type: "article",
      topics: ["database"],
      author: null,
      publication: null,
      url: "https://example.com/postgres",
      priority: "high",
      is_read: false,
      archived_at: "2026-01-03T00:00:00Z",
      read_at: "2026-01-02T00:00:00Z",
      last_opened_at: "2026-01-04T00:00:00Z",
      reading_progress: 0.5,
      manual_priority: "low",
      created_at: new Date("2026-01-01T00:00:00Z"),
      duration: null,
      thumbnail_url: null,
      extracted_links: [{ text: "Docs", url: "https://postgresql.org" }],
      content_extracted_at: null,
      ai_summary_text: "AI summary",
      processing_status: "ready",
      rejection_reason: null,
      content_classification: { kind: "article" },
      detected_media: [],
      information_density: 0.8,
    });
    expect(item).toMatchObject({
      id: "item-1",
      topics: ["database"],
      isRead: false,
      aiSummary: "AI summary",
      informationDensity: 0.8,
      readingProgress: 0.5,
      manualPriority: "low",
    });
    expect(item.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(item.archivedAt).toBe("2026-01-03T00:00:00.000Z");
  });

  it("maps capture errors and token lifecycle dates", () => {
    const capture = mapCapture({
      id: "c",
      url: "https://e.test",
      normalized_url: "https://e.test/",
      topics: [],
      priority: "medium",
      source: "web",
      status: "failed",
      retryable: true,
      attempts: 2,
      last_error_code: "UPSTREAM",
      last_error_message: "retry",
      created_at: "2026-01-01Z",
      updated_at: "2026-01-02Z",
    });
    expect(capture.error).toEqual({ code: "UPSTREAM", message: "retry" });
    const token = mapCaptureToken({
      id: "t",
      name: "phone",
      token_hash: "hash",
      token_prefix: "dst_cap_a",
      created_at: "2026-01-01Z",
      last_used_at: null,
      revoked_at: null,
    });
    expect(token).toMatchObject({ id: "t", lastUsedAt: undefined, revokedAt: undefined });
  });
});
