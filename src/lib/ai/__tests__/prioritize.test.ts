/**
 * Unit tests for src/lib/ai/prioritize.ts
 *
 * The Gemini client, DB helpers, and preferences module are all mocked.
 * Test fixture: the TechCrunch "Claude Code voice mode" article, used to
 * verify that an AI/developer-tools-focused article scores highly for a
 * user who loves those topics.
 */

process.env.DB_PATH = ":memory:";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("../client", () => ({
  generateText: jest.fn(),
  DEFAULT_MODEL: "gemini-2.5-flash",
  FAST_MODEL: "gemini-2.5-flash-lite",
}));

jest.mock("@/lib/db", () => ({
  getItems: jest.fn(),
  updateItemPriorityScore: jest.fn(),
  getUserSetting: jest.fn(),
}));

jest.mock("../preferences", () => ({
  getPreferences: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { reprioritize } from "../prioritize";
import { getItems, updateItemPriorityScore, getUserSetting } from "@/lib/db";
import { getPreferences } from "../preferences";
import { generateText } from "../client";
import type { ContentItem } from "@/lib/types";
import type { UserPreferenceProfile } from "../types";

const mockGetItems = getItems as jest.Mock;
const mockUpdateItemPriorityScore = updateItemPriorityScore as jest.Mock;
const mockGetUserSetting = getUserSetting as jest.Mock;
const mockGetPreferences = getPreferences as jest.Mock;
const mockGenerateText = generateText as jest.Mock;

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Builds a ContentItem with sensible defaults. */
function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: `item-${Math.random().toString(36).slice(2)}`,
    title: "Generic Test Article",
    summary: "A placeholder summary.",
    sourceType: "manual",
    contentType: "article",
    topics: ["General"],
    url: "https://example.com/article",
    priority: "medium",
    isRead: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

const techCrunchItem: ContentItem = makeItem({
  id: "techcrunch-claude-voice-2026",
  title: "Claude Code rolls out a voice mode capability",
  summary:
    "Anthropic has released a new voice mode capability for Claude Code, allowing developers to navigate and edit code hands-free.",
  sourceType: "manual",
  contentType: "article",
  topics: ["AI", "Developer Tools", "Voice AI"],
  url: "https://techcrunch.com/2026/03/03/claude-code-rolls-out-a-voice-mode-capability/",
  author: "Kyle Wiggers",
  publication: "TechCrunch",
  createdAt: new Date().toISOString(), // published today
});

/** Neutral preferences — no learned signal yet. */
const neutralPreferences: UserPreferenceProfile = {
  topicWeights: {},
  sourceWeights: {},
  authorWeights: {},
  contentTypeWeights: {},
  recentFeedbackSummary: "",
  lastUpdated: new Date().toISOString(),
};

/** Preferences of a user who loves AI and developer-tools content. */
const aiEnthusiastPreferences: UserPreferenceProfile = {
  topicWeights: { AI: 0.95, "Developer Tools": 0.9, "Voice AI": 0.85 },
  sourceWeights: { manual: 0.8 },
  authorWeights: { "Kyle Wiggers": 0.85 },
  contentTypeWeights: { article: 0.9 },
  recentFeedbackSummary:
    "User strongly prefers AI, developer tools, and Anthropic-related content from tech publications.",
  lastUpdated: new Date().toISOString(),
};

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUserSetting.mockReturnValue(null); // use default agent config
  mockGetPreferences.mockReturnValue(neutralPreferences);
  mockGetItems.mockReturnValue([]);
  mockUpdateItemPriorityScore.mockReturnValue(undefined);
});

// ── Basic behaviour ───────────────────────────────────────────────────────────

describe("reprioritize — basic behaviour", () => {
  it("returns an empty array when there are no items", async () => {
    mockGetItems.mockReturnValue([]);
    const result = await reprioritize();
    expect(result).toEqual([]);
  });

  it("returns one ScoredItem per content item", async () => {
    const items = [makeItem({ id: "a" }), makeItem({ id: "b" }), makeItem({ id: "c" })];
    mockGetItems.mockReturnValue(items);

    const result = await reprioritize();

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.itemId)).toEqual(expect.arrayContaining(["a", "b", "c"]));
  });

  it("returns results sorted by score descending", async () => {
    const recent = makeItem({ id: "recent", createdAt: new Date().toISOString() });
    const old = makeItem({ id: "old", createdAt: daysAgo(25) });
    mockGetItems.mockReturnValue([old, recent]); // note: intentionally reversed

    const result = await reprioritize();

    expect(result[0].itemId).toBe("recent");
    expect(result[1].itemId).toBe("old");
    expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
  });

  it("persists each item's score to the database", async () => {
    mockGetItems.mockReturnValue([techCrunchItem]);

    await reprioritize();

    expect(mockUpdateItemPriorityScore).toHaveBeenCalledTimes(1);
    expect(mockUpdateItemPriorityScore).toHaveBeenCalledWith(
      techCrunchItem.id,
      expect.any(Number),
      expect.stringMatching(/^(high|medium|low)$/),
    );
  });

  it("each ScoredItem has score in range 0–100", async () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeItem({ id: `item-${i}`, createdAt: daysAgo(i * 5) }),
    );
    mockGetItems.mockReturnValue(items);

    const result = await reprioritize();

    for (const s of result) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
    }
  });

  it("does not call the AI API when useAI is false (default)", async () => {
    mockGetItems.mockReturnValue([techCrunchItem]);

    await reprioritize(); // useAI defaults to false

    expect(mockGenerateText).not.toHaveBeenCalled();
  });
});

// ── Heuristic scoring ─────────────────────────────────────────────────────────

describe("reprioritize — heuristic scoring", () => {
  it("gives a higher score to a recent item than to an old one", async () => {
    const fresh = makeItem({ id: "fresh", createdAt: new Date().toISOString() });
    const stale = makeItem({ id: "stale", createdAt: daysAgo(20) });
    mockGetItems.mockReturnValue([fresh, stale]);

    const result = await reprioritize();

    const freshScore = result.find((r) => r.itemId === "fresh")!.score;
    const staleScore = result.find((r) => r.itemId === "stale")!.score;
    expect(freshScore).toBeGreaterThan(staleScore);
  });

  it("applies a read penalty — a read item scores lower than an identical unread one", async () => {
    const baseDate = new Date().toISOString();
    const unread = makeItem({ id: "unread", isRead: false, createdAt: baseDate });
    const read = makeItem({ id: "read", isRead: true, createdAt: baseDate });
    mockGetItems.mockReturnValue([unread, read]);

    const result = await reprioritize();

    const unreadScore = result.find((r) => r.itemId === "unread")!.score;
    const readScore = result.find((r) => r.itemId === "read")!.score;
    expect(unreadScore).toBeGreaterThan(readScore);
  });

  it("scores a matching-topic article higher when user has strong topic preferences", async () => {
    mockGetPreferences.mockReturnValue(aiEnthusiastPreferences);

    const aiArticle = makeItem({
      id: "ai-article",
      topics: ["AI", "Developer Tools"],
      createdAt: new Date().toISOString(),
    });
    const sportsArticle = makeItem({
      id: "sports-article",
      topics: ["Sports", "Football"],
      createdAt: new Date().toISOString(),
    });
    mockGetItems.mockReturnValue([aiArticle, sportsArticle]);

    const result = await reprioritize();

    const aiScore = result.find((r) => r.itemId === "ai-article")!.score;
    const sportsScore = result.find((r) => r.itemId === "sports-article")!.score;
    expect(aiScore).toBeGreaterThan(sportsScore);
  });

  it("scores the TechCrunch Claude Code article as high priority for an AI enthusiast", async () => {
    mockGetPreferences.mockReturnValue(aiEnthusiastPreferences);
    mockGetItems.mockReturnValue([techCrunchItem]);

    const result = await reprioritize();

    const scored = result.find((r) => r.itemId === techCrunchItem.id)!;
    expect(scored).toBeDefined();
    expect(scored.priority).toBe("high");
    expect(scored.score).toBeGreaterThanOrEqual(70);
  });

  it("labels the TechCrunch article as medium or low priority for a user with no preferences", async () => {
    mockGetPreferences.mockReturnValue(neutralPreferences);
    mockGetItems.mockReturnValue([techCrunchItem]);

    const result = await reprioritize();

    const scored = result.find((r) => r.itemId === techCrunchItem.id)!;
    expect(scored).toBeDefined();

    if (scored.score >= 70) expect(scored.priority).toBe("high");
    else if (scored.score >= 40) expect(scored.priority).toBe("medium");
    else expect(scored.priority).toBe("low");
  });

  it("ranks the TechCrunch article above an older, off-topic article for an AI enthusiast", async () => {
    mockGetPreferences.mockReturnValue(aiEnthusiastPreferences);

    const oldCookingArticle = makeItem({
      id: "old-cooking",
      title: "10 easy pasta recipes",
      topics: ["Food", "Cooking"],
      createdAt: daysAgo(15),
    });
    mockGetItems.mockReturnValue([oldCookingArticle, techCrunchItem]);

    const result = await reprioritize();

    const techCrunchScore = result.find((r) => r.itemId === techCrunchItem.id)!.score;
    const cookingScore = result.find((r) => r.itemId === "old-cooking")!.score;
    expect(techCrunchScore).toBeGreaterThan(cookingScore);
  });
});

// ── Priority label mapping ────────────────────────────────────────────────────

describe("reprioritize — priority label consistency", () => {
  it("labels each item consistently with its numeric score", async () => {
    const items = [
      makeItem({ id: "fresh-ai", topics: ["AI"], createdAt: new Date().toISOString() }),
      makeItem({ id: "mid-age", topics: ["General"], createdAt: daysAgo(8) }),
      makeItem({ id: "very-old", topics: ["General"], createdAt: daysAgo(28), isRead: true }),
    ];
    mockGetItems.mockReturnValue(items);

    const result = await reprioritize();

    for (const s of result) {
      if (s.score >= 70) expect(s.priority).toBe("high");
      else if (s.score >= 40) expect(s.priority).toBe("medium");
      else expect(s.priority).toBe("low");
    }
  });

  it("persists the correct priority label for the TechCrunch article", async () => {
    mockGetPreferences.mockReturnValue(aiEnthusiastPreferences);
    mockGetItems.mockReturnValue([techCrunchItem]);

    await reprioritize();

    const [, , persistedPriority] = mockUpdateItemPriorityScore.mock.calls[0] as [
      string,
      number,
      string,
    ];
    expect(persistedPriority).toBe("high");
  });
});

// ── AI-assisted ranking ───────────────────────────────────────────────────────

describe("reprioritize — AI-assisted ranking (useAI=true)", () => {
  it("calls the Gemini API when useAI=true and items are present", async () => {
    const aiRankingResponse = JSON.stringify([
      { id: techCrunchItem.id, score: 92, reason: "Highly relevant AI developer tools content" },
    ]);
    mockGenerateText.mockResolvedValue(aiRankingResponse);
    mockGetItems.mockReturnValue([techCrunchItem]);

    await reprioritize(true);

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("merges AI score with heuristic score (60% AI / 40% heuristic)", async () => {
    mockGetPreferences.mockReturnValue(aiEnthusiastPreferences);

    // AI returns a score of 90 for the TechCrunch article.
    mockGenerateText.mockResolvedValue(
      JSON.stringify([{ id: techCrunchItem.id, score: 90, reason: "Top AI content" }]),
    );

    mockGetItems.mockReturnValue([techCrunchItem]);

    const result = await reprioritize(true);
    const scored = result.find((r) => r.itemId === techCrunchItem.id)!;

    // The merged score should be high (≥70), as both AI and heuristic signals are strong.
    expect(scored.score).toBeGreaterThanOrEqual(70);
    expect(scored.priority).toBe("high");
  });

  it("falls back to heuristic scores gracefully if the AI API call fails", async () => {
    mockGenerateText.mockRejectedValue(new Error("API error — rate limit exceeded"));
    mockGetItems.mockReturnValue([techCrunchItem]);

    // Should not throw — error is caught internally.
    const result = await reprioritize(true);

    expect(result).toHaveLength(1);
    expect(result[0].itemId).toBe(techCrunchItem.id);
    expect(typeof result[0].score).toBe("number");
  });

  it("does not call the AI API when there are no items", async () => {
    mockGetItems.mockReturnValue([]);

    await reprioritize(true);

    expect(mockGenerateText).not.toHaveBeenCalled();
  });
});
