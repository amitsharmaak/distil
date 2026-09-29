/**
 * Unit tests for src/lib/ai/prompts.ts
 *
 * These are pure functions — no mocks needed.
 * Test fixture: the TechCrunch "Claude Code voice mode" article.
 */

import { chunkNotesPrompt, summarizePrompt } from "@/lib/prompts/summarize";
import { prioritizePrompt } from "@/lib/prompts/prioritize";
import { researchPlanPrompt, researchSynthesizePrompt } from "@/lib/prompts/research";
import type { ContentItem } from "@/lib/types";
import type { UserPreferenceProfile } from "../types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const techCrunchItem: ContentItem = {
  id: "techcrunch-claude-voice-2026",
  title: "Claude Code rolls out a voice mode capability",
  summary:
    "Anthropic has released a new voice mode capability for Claude Code, its AI-powered coding assistant, allowing developers to navigate and edit code hands-free.",
  sourceType: "manual",
  contentType: "article",
  topics: ["AI", "Developer Tools", "Voice AI"],
  url: "https://techcrunch.com/2026/03/03/claude-code-rolls-out-a-voice-mode-capability/",
  priority: "medium",
  isRead: false,
  createdAt: new Date().toISOString(),
  author: "Kyle Wiggers",
  publication: "TechCrunch",
};

const aiPreferences: UserPreferenceProfile = {
  topicWeights: { AI: 0.9, "Developer Tools": 0.85, "Voice AI": 0.8 },
  sourceWeights: { manual: 0.75 },
  authorWeights: { "Kyle Wiggers": 0.8 },
  contentTypeWeights: { article: 0.85 },
  recentFeedbackSummary:
    "User strongly prefers AI and developer tools content, especially from TechCrunch and Anthropic-related sources.",
  lastUpdated: new Date().toISOString(),
};

// ── summarizePrompt ───────────────────────────────────────────────────────────

describe("summarizePrompt", () => {
  it("includes the article title", () => {
    const prompt = summarizePrompt(techCrunchItem, "brief");
    expect(prompt).toContain("Claude Code rolls out a voice mode capability");
  });

  it("includes author and publication", () => {
    const prompt = summarizePrompt(techCrunchItem, "brief");
    expect(prompt).toContain("Kyle Wiggers");
    expect(prompt).toContain("TechCrunch");
  });

  it("includes all topic tags", () => {
    const prompt = summarizePrompt(techCrunchItem, "brief");
    expect(prompt).toContain("AI");
    expect(prompt).toContain("Developer Tools");
    expect(prompt).toContain("Voice AI");
  });

  it("uses the OG summary when no fullContent is provided", () => {
    const prompt = summarizePrompt(techCrunchItem, "brief");
    expect(prompt).toContain("Available Summary");
    expect(prompt).toContain(techCrunchItem.summary!);
  });

  it("uses fullContent when it is provided", () => {
    const withContent: ContentItem = {
      ...techCrunchItem,
      fullContent: "Full article body text from the scraped TechCrunch page...",
    };
    const prompt = summarizePrompt(withContent, "brief");
    expect(prompt).toContain("Full Content");
    expect(prompt).toContain("Full article body text from the scraped TechCrunch page...");
    expect(prompt).not.toContain("Available Summary");
  });

  it("falls back gracefully when summary is empty and fullContent is absent", () => {
    const titleOnly: ContentItem = {
      ...techCrunchItem,
      summary: "",
      fullContent: undefined,
    };
    const prompt = summarizePrompt(titleOnly, "brief");
    expect(prompt).toContain("Only title and metadata available");
  });

  describe("brief format (content-aware)", () => {
    const prompt = summarizePrompt(techCrunchItem, "brief");

    it("asks the model to choose a shape from the hints rather than fill a fixed template", () => {
      expect(prompt).toContain("There is no fixed template");
      for (const shape of [
        "argument",
        "news",
        "how-to",
        "research",
        "conversation",
        "meeting-note",
        "product",
        "list",
      ]) {
        expect(prompt).toContain(`| ${shape} |`);
      }
      expect(prompt).toContain('"shape"');
    });

    it("caps the brief and forbids generic or filler sections", () => {
      expect(prompt).toContain("1-3 plain sentences");
      expect(prompt).toContain("at most 3");
      expect(prompt).toContain("At most 7 items across all sections");
      expect(prompt).toContain('not "Key Points"');
      expect(prompt).toContain("Never include an empty or filler section");
    });

    it("records open questions for the later detailed summary", () => {
      expect(prompt).toContain('"openQuestions"');
      expect(prompt).toContain("2-5 short questions");
    });

    it("does not request the v1 sections", () => {
      expect(prompt).not.toContain("Why This Matters");
      expect(prompt).not.toContain("Notable Quotes");
      expect(prompt).not.toContain("keyPoints");
    });

    it("summarizes from chunk notes when given them", () => {
      const fromNotes = summarizePrompt(techCrunchItem, "brief", {
        kind: "notes",
        text: "### Part 1\n- A specific note",
      });
      expect(fromNotes).toContain("Notes From Each Part Of A Long Document");
      expect(fromNotes).toContain("- A specific note");
      expect(fromNotes).not.toContain("Full Content");
    });
  });

  describe("detailed format", () => {
    it("requests Key Points, Why This Matters, and Notable Quotes sections", () => {
      const prompt = summarizePrompt(techCrunchItem, "detailed");
      expect(prompt).toContain("Key Points");
      expect(prompt).toContain("Why This Matters");
      expect(prompt).toContain("Notable Quotes");
      expect(prompt).toContain("5-8 bullet points");
    });

    it("carries the detailed instructions over chunk notes too", () => {
      const prompt = summarizePrompt(techCrunchItem, "detailed", { kind: "notes", text: "- n" });
      expect(prompt).toContain("5-8 bullet points");
      expect(prompt).toContain("Notes From Each Part Of A Long Document");
    });
  });

  describe("chunkNotesPrompt", () => {
    it("asks for specific notes, not a mini-summary", () => {
      const prompt = chunkNotesPrompt("Chunk body", 1, 4);
      expect(prompt).toContain("part 2 of 4");
      expect(prompt).toContain("Chunk body");
      expect(prompt).toContain('"notes"');
      expect(prompt).toContain("numbers, names, dates, steps in order");
    });
  });

  it("specifies the content type in the prompt", () => {
    const prompt = summarizePrompt(techCrunchItem, "brief");
    expect(prompt).toContain("article");
  });
});

// ── prioritizePrompt ──────────────────────────────────────────────────────────

describe("prioritizePrompt", () => {
  const itemEntry = {
    id: techCrunchItem.id,
    title: techCrunchItem.title,
    topics: techCrunchItem.topics,
    sourceType: techCrunchItem.sourceType,
    author: techCrunchItem.author,
  };

  it("includes item ID and title", () => {
    const prompt = prioritizePrompt([itemEntry], aiPreferences);
    expect(prompt).toContain(techCrunchItem.id);
    expect(prompt).toContain(techCrunchItem.title);
  });

  it("includes the user preference summary", () => {
    const prompt = prioritizePrompt([itemEntry], aiPreferences);
    expect(prompt).toContain(aiPreferences.recentFeedbackSummary);
  });

  it("includes serialized topic weights", () => {
    const prompt = prioritizePrompt([itemEntry], aiPreferences);
    expect(prompt).toContain("AI");
    expect(prompt).toContain("Developer Tools");
  });

  it("includes the author when provided", () => {
    const prompt = prioritizePrompt([itemEntry], aiPreferences);
    expect(prompt).toContain("Kyle Wiggers");
  });

  it("instructs output as JSON array", () => {
    const prompt = prioritizePrompt([itemEntry], aiPreferences);
    expect(prompt).toContain("JSON array");
    expect(prompt).toContain('"id"');
    expect(prompt).toContain('"score"');
  });

  it("handles multiple items", () => {
    const items = [
      itemEntry,
      { id: "other-1", title: "Sports recap", topics: ["Sports"], sourceType: "manual" },
    ];
    const prompt = prioritizePrompt(items, aiPreferences);
    expect(prompt).toContain(techCrunchItem.id);
    expect(prompt).toContain("other-1");
  });

  it("uses a neutral fallback message when no preference summary exists", () => {
    const emptyPrefs: UserPreferenceProfile = {
      ...aiPreferences,
      recentFeedbackSummary: "",
    };
    const prompt = prioritizePrompt([itemEntry], emptyPrefs);
    expect(prompt).toContain("No feedback yet");
  });
});

// ── researchPlanPrompt ────────────────────────────────────────────────────────

describe("researchPlanPrompt", () => {
  const query = "Claude Code voice mode capability";

  it("includes the research query", () => {
    const prompt = researchPlanPrompt(query);
    expect(prompt).toContain(query);
  });

  it("includes context from source article when provided", () => {
    const context = "Anthropic launched voice mode for Claude Code on March 3, 2026.";
    const prompt = researchPlanPrompt(query, context);
    expect(prompt).toContain("Context from Source Article");
    expect(prompt).toContain(context);
  });

  it("omits context section when not provided", () => {
    const prompt = researchPlanPrompt(query);
    expect(prompt).not.toContain("Context from Source Article");
  });

  it("instructs output as a JSON array", () => {
    const prompt = researchPlanPrompt(query);
    expect(prompt).toContain("JSON array");
  });
});

// ── researchSynthesizePrompt ──────────────────────────────────────────────────

describe("researchSynthesizePrompt", () => {
  it("includes the original query", () => {
    const prompt = researchSynthesizePrompt("Claude Code voice mode", "findings here");
    expect(prompt).toContain("Claude Code voice mode");
  });

  it("includes the findings", () => {
    const findings = "Voice mode uses ASR pipeline. Available since March 2026.";
    const prompt = researchSynthesizePrompt("query", findings);
    expect(prompt).toContain(findings);
  });

  it("requests all four report sections", () => {
    const prompt = researchSynthesizePrompt("query", "findings");
    expect(prompt).toContain("Executive Summary");
    expect(prompt).toContain("Key Findings");
    expect(prompt).toContain("Analysis");
    expect(prompt).toContain("Conclusion");
  });
});
