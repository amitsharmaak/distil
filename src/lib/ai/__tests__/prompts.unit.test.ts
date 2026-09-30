/**
 * Unit tests for src/lib/ai/prompts.ts
 *
 * These are pure functions — no mocks needed.
 * Test fixture: the TechCrunch "Claude Code voice mode" article.
 */

import { briefSummaryPrompt, chunkNotesPrompt, detailedDeltaPrompt } from "@/lib/prompts/summarize";
import { prioritizePrompt } from "@/lib/prompts/prioritize";
import {
  researchNotesPrompt,
  researchPlanPrompt,
  researchSynthesizePrompt,
} from "@/lib/prompts/research";
import type { ContentItem } from "@/lib/types";
import type { BriefSummaryOutput, UserPreferenceProfile } from "../types";

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

// ── briefSummaryPrompt ──────────────────────────────────────────────────────────

describe("briefSummaryPrompt", () => {
  it("includes the article title", () => {
    const prompt = briefSummaryPrompt(techCrunchItem);
    expect(prompt).toContain("Claude Code rolls out a voice mode capability");
  });

  it("includes author and publication", () => {
    const prompt = briefSummaryPrompt(techCrunchItem);
    expect(prompt).toContain("Kyle Wiggers");
    expect(prompt).toContain("TechCrunch");
  });

  it("includes all topic tags", () => {
    const prompt = briefSummaryPrompt(techCrunchItem);
    expect(prompt).toContain("AI");
    expect(prompt).toContain("Developer Tools");
    expect(prompt).toContain("Voice AI");
  });

  it("uses the OG summary when no fullContent is provided", () => {
    const prompt = briefSummaryPrompt(techCrunchItem);
    expect(prompt).toContain("Available Summary");
    expect(prompt).toContain(techCrunchItem.summary!);
  });

  it("uses fullContent when it is provided", () => {
    const withContent: ContentItem = {
      ...techCrunchItem,
      fullContent: "Full article body text from the scraped TechCrunch page...",
    };
    const prompt = briefSummaryPrompt(withContent);
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
    const prompt = briefSummaryPrompt(titleOnly);
    expect(prompt).toContain("Only title and metadata available");
  });

  describe("brief format (content-aware)", () => {
    const prompt = briefSummaryPrompt(techCrunchItem);

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
      const fromNotes = briefSummaryPrompt(techCrunchItem, {
        kind: "notes",
        text: "### Part 1\n- A specific note",
      });
      expect(fromNotes).toContain("Notes From Each Part Of A Long Document");
      expect(fromNotes).toContain("- A specific note");
      expect(fromNotes).not.toContain("Full Content");
    });
  });

  describe("detailed format (delta over the brief)", () => {
    const brief: BriefSummaryOutput = {
      shape: "news",
      overview: "Claude Code gained a hands-free voice mode.",
      sections: [
        { heading: "What changes for developers", format: "bullets", items: ["Dictate edits"] },
      ],
      openQuestions: ["How accurate is it on code identifiers?", "Which platforms get it?"],
    };
    const prompt = detailedDeltaPrompt(techCrunchItem, brief);

    it("shows the brief as already read, with its open questions", () => {
      expect(prompt).toContain("The brief (the reader has already read this)");
      expect(prompt).toContain('"overview": "Claude Code gained a hands-free voice mode."');
      expect(prompt).toContain('"heading": "What changes for developers"');
      expect(prompt).toContain("1. How accurate is it on code identifiers?");
      expect(prompt).toContain("2. Which platforms get it?");
      // The open questions are listed once, not repeated inside the brief JSON.
      expect(prompt.match(/Which platforms get it\?/g)).toHaveLength(1);
      expect(prompt).not.toContain('"shape"');
    });

    it("forbids restating the brief and asks for what it left out", () => {
      expect(prompt).toContain("Never restate a brief point");
      expect(prompt).toContain("Answer the open questions");
      expect(prompt).toContain("reasoning and mechanism");
      expect(prompt).toContain("caveats and limits, counterpoints");
    });

    it("scales to the source instead of padding", () => {
      expect(prompt).toContain("Scale to the content");
      expect(prompt).toContain("If the brief already covers the piece, return one section");
      expect(prompt).toContain("Never pad");
    });

    it("asks each section to name what it deepens", () => {
      expect(prompt).toContain('"deepens"');
      expect(prompt).not.toContain("5-8 bullet points");
      expect(prompt).not.toContain("Why This Matters");
    });

    it("includes the source and works over chunk notes too", () => {
      expect(prompt).toContain(techCrunchItem.summary!);
      const fromNotes = detailedDeltaPrompt(techCrunchItem, brief, { kind: "notes", text: "- n" });
      expect(fromNotes).toContain("Notes From Each Part Of A Long Document");
      expect(fromNotes).toContain("Never restate a brief point");
    });

    it("says so when the brief recorded no open questions", () => {
      expect(detailedDeltaPrompt(techCrunchItem, { ...brief, openQuestions: [] })).toContain(
        "(none recorded)"
      );
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
    const prompt = briefSummaryPrompt(techCrunchItem);
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

  it("cites by number from the source list and never asks for links", () => {
    const prompt = researchSynthesizePrompt("query", "findings", true);
    expect(prompt).toContain('bracketed numbers from the "Sources:" line');
    expect(prompt).toContain("Never write URLs");
    expect(prompt).not.toMatch(/inline source links|Include source links/);
  });

  it("asks for the finished report only, starting with its first ## heading", () => {
    const prompt = researchSynthesizePrompt("query", "findings");
    expect(prompt).toContain('Begin directly with the line "## Executive Summary"');
    expect(prompt).toMatch(/Do not include a title, preamble, notes, planning or reasoning/);
    expect(prompt).toContain("## Key Findings");
  });

  it("asks for no citations when there are no sources", () => {
    const prompt = researchSynthesizePrompt("query", "findings");
    expect(prompt).not.toContain("## Numbered Sources");
    expect(prompt).toContain("Do not add citation numbers");
  });
});

describe("researchNotesPrompt", () => {
  it("asks for specifics and no URLs on the grounded path, without a sources block", () => {
    const prompt = researchNotesPrompt("How fast is X?", { grounded: true, kind: "question" });
    expect(prompt).toContain("## Question\nHow fast is X?");
    expect(prompt).toMatch(/facts, figures and dates/);
    expect(prompt).toMatch(/Named examples/);
    expect(prompt).toMatch(/disagree/);
    expect(prompt).toContain("Do not put URLs");
    expect(prompt).not.toContain("```sources");
  });

  it("asks for at most three recalled sources as a trailing block on the ungrounded path", () => {
    const prompt = researchNotesPrompt("Gap?", { grounded: false, kind: "gap" });
    expect(prompt).toContain("specific gap");
    expect(prompt).toContain("at most three sources you are confident exist");
    expect(prompt).toContain("```sources");
  });
});
