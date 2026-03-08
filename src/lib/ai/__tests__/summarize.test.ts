/**
 * Unit tests for src/lib/ai/summarize.ts
 *
 * The router and DB helpers are mocked.
 * Test fixture: the TechCrunch "Claude Code voice mode" article, used to
 * verify correct caching and generation behaviour.
 */

process.env.DB_PATH = ":memory:";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("../router", () => ({
  generateJSON: jest.fn(),
  getEffectiveModel: jest.fn(() => ({ model: "gemini-2.5-flash" })),
}));

jest.mock("@/lib/db", () => ({
  getAISummary: jest.fn(),
  upsertAISummary: jest.fn(),
  getItemById: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { generateSummary } from "../summarize";
import { generateJSON } from "../router";
import { getAISummary, upsertAISummary, getItemById } from "@/lib/db";
import type { ContentItem } from "@/lib/types";

// Typed mock helpers.
const mockGenerateJSON = generateJSON as jest.Mock;
const mockGetAISummary = getAISummary as jest.Mock;
const mockUpsertAISummary = upsertAISummary as jest.Mock;
const mockGetItemById = getItemById as jest.Mock;

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

// Structured JSON output that renders to the expected markdown (short content uses summarize).
const mockBriefOutput = {
  overview:
    "Anthropic has launched voice mode for Claude Code, enabling hands-free coding via speech-to-text integration. The feature is available to all Claude Code users as of March 2026.",
  keyPoints: [
    "Voice commands now drive code navigation, editing, and terminal interactions",
    "Built on Anthropic's internal ASR pipeline, optimised for programming vocabulary",
    "Available in the CLI with no extra configuration required",
    "Works across macOS, Linux, and Windows",
    "Part of a broader push to make Claude Code accessible to more developers",
  ],
};

const mockDetailedOutput = {
  overview:
    "Anthropic has shipped a voice mode for Claude Code that lets developers dictate code and commands hands-free, lowering the barrier for accessibility and repetitive tasks.",
  keyPoints: [
    "Voice input integrates directly into the Claude Code CLI",
    "ASR optimised for programming terms and code identifiers",
    "Supports dictation for editing, terminal commands, and git workflows",
    "Available as opt-in feature; requires microphone permissions",
    "Works on macOS, Linux, and Windows as of March 2026",
    "No additional subscription required — included with existing access",
    "Open feedback period for accuracy improvements",
  ],
  whyItMatters:
    "Voice mode democratises AI-assisted coding for developers with repetitive strain injuries and other accessibility needs, while also speeding up routine tasks like file navigation and command execution.",
  notableQuotes: [
    '"We want Claude Code to be the most accessible coding assistant on the market." — Anthropic spokesperson',
  ],
};

// Rendered markdown (what gets stored and returned).
const mockBriefSummary = `## TL;DR

Anthropic has launched voice mode for Claude Code, enabling hands-free coding via speech-to-text integration. The feature is available to all Claude Code users as of March 2026.

## Key Points

- Voice commands now drive code navigation, editing, and terminal interactions
- Built on Anthropic's internal ASR pipeline, optimised for programming vocabulary
- Available in the CLI with no extra configuration required
- Works across macOS, Linux, and Windows
- Part of a broader push to make Claude Code accessible to more developers`;

const mockDetailedSummary = `## TL;DR

Anthropic has shipped a voice mode for Claude Code that lets developers dictate code and commands hands-free, lowering the barrier for accessibility and repetitive tasks.

## Key Points

- Voice input integrates directly into the Claude Code CLI
- ASR optimised for programming terms and code identifiers
- Supports dictation for editing, terminal commands, and git workflows
- Available as opt-in feature; requires microphone permissions
- Works on macOS, Linux, and Windows as of March 2026
- No additional subscription required — included with existing access
- Open feedback period for accuracy improvements

## Why This Matters

Voice mode democratises AI-assisted coding for developers with repetitive strain injuries and other accessibility needs, while also speeding up routine tasks like file navigation and command execution.

## Notable Quotes

- "We want Claude Code to be the most accessible coding assistant on the market." — Anthropic spokesperson`;

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  // Defaults: no cached summary, item found in DB, generateJSON returns brief output.
  // techCrunchItem has ~200 chars in summary → ~50 tokens → uses "summarize" task.
  mockGetAISummary.mockReturnValue(undefined);
  mockGetItemById.mockReturnValue(techCrunchItem);
  mockGenerateJSON.mockResolvedValue(mockBriefOutput);
});

// ── Cache behaviour ───────────────────────────────────────────────────────────

describe("generateSummary — cache behaviour", () => {
  it("returns cached summary and skips the API when cache exists for the same length", async () => {
    mockGetAISummary.mockReturnValue({
      id: "sum-cached-1",
      item_id: techCrunchItem.id,
      summary: mockBriefSummary,
      model: "gemini-2.5-flash",
      prompt_type: "brief",
      created_at: new Date().toISOString(),
    });

    const result = await generateSummary(techCrunchItem.id, { length: "brief" });

    expect(result.cached).toBe(true);
    expect(result.summary).toBe(mockBriefSummary);
    expect(mockGenerateJSON).not.toHaveBeenCalled();
  });

  it("calls the API when no cached summary exists", async () => {
    mockGetAISummary.mockReturnValue(undefined);

    const result = await generateSummary(techCrunchItem.id, { length: "brief" });

    expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
    expect(result.cached).toBe(false);
    expect(result.summary).toBe(mockBriefSummary);
  });

  it("bypasses cache when force=true and regenerates from the API", async () => {
    mockGetAISummary.mockReturnValue({
      id: "sum-cached-2",
      item_id: techCrunchItem.id,
      summary: "Old brief summary that should be ignored.",
      model: "gemini-2.5-flash",
      prompt_type: "brief",
      created_at: new Date().toISOString(),
    });

    const result = await generateSummary(techCrunchItem.id, {
      length: "brief",
      force: true,
    });

    expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
    expect(result.cached).toBe(false);
    expect(result.summary).toBe(mockBriefSummary);
  });

  it("bypasses cache when the cached prompt_type does not match the requested length", async () => {
    const briefRow = {
      id: "sum-cached-3",
      item_id: techCrunchItem.id,
      summary: mockBriefSummary,
      model: "gemini-2.5-flash",
      prompt_type: "brief",
      created_at: new Date().toISOString(),
    };
    mockGetAISummary.mockImplementation(
      (_id: string, type?: string) => (type === "brief" ? briefRow : undefined),
    );

    mockGenerateJSON.mockResolvedValue(mockDetailedOutput);

    const result = await generateSummary(techCrunchItem.id, {
      length: "detailed",
    });

    expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
    expect(result.cached).toBe(false);
    expect(result.summary).toBe(mockDetailedSummary);
  });
});

// ── Generation ────────────────────────────────────────────────────────────────

describe("generateSummary — generation", () => {
  it("stores the generated summary in the DB cache", async () => {
    await generateSummary(techCrunchItem.id, { length: "brief" });

    expect(mockUpsertAISummary).toHaveBeenCalledTimes(1);
    expect(mockUpsertAISummary).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: techCrunchItem.id,
        summary: mockBriefSummary,
        promptType: "brief",
        model: "gemini-2.5-flash",
      }),
    );
  });

  it("persists model name in the DB cache entry", async () => {
    await generateSummary(techCrunchItem.id, { length: "brief" });

    const call = mockUpsertAISummary.mock.calls[0][0] as { model: string };
    expect(call.model).toBe("gemini-2.5-flash");
  });

  it("stores a unique id with each upsert", async () => {
    await generateSummary(techCrunchItem.id, { length: "brief" });

    const call = mockUpsertAISummary.mock.calls[0][0] as { id: string };
    expect(typeof call.id).toBe("string");
    expect(call.id.length).toBeGreaterThan(0);
  });

  it("throws an error when the item does not exist in the DB", async () => {
    mockGetItemById.mockReturnValue(undefined);

    await expect(
      generateSummary("nonexistent-item-id"),
    ).rejects.toThrow("Item not found");
  });

  it("includes the article title in the prompt sent to the AI", async () => {
    await generateSummary(techCrunchItem.id, { length: "brief" });

    const promptArg = mockGenerateJSON.mock.calls[0][0] as string;
    expect(promptArg).toContain(techCrunchItem.title);
  });

  it("includes the topics in the prompt sent to the AI", async () => {
    await generateSummary(techCrunchItem.id, { length: "brief" });

    const promptArg = mockGenerateJSON.mock.calls[0][0] as string;
    expect(promptArg).toContain("AI");
    expect(promptArg).toContain("Developer Tools");
  });

  it("defaults to 'brief' length when no options are provided", async () => {
    await generateSummary(techCrunchItem.id);

    const promptArg = mockGenerateJSON.mock.calls[0][0] as string;
    expect(promptArg).toContain("3-5");
    expect(promptArg).toContain("keyPoints");
  });
});

// ── TechCrunch article end-to-end ─────────────────────────────────────────────

describe("generateSummary — TechCrunch article fixture", () => {
  it("brief summary contains TL;DR and Key Points sections", async () => {
    const result = await generateSummary(techCrunchItem.id, {
      length: "brief",
    });

    expect(result.summary).toContain("TL;DR");
    expect(result.summary).toContain("Key Points");
  });

  it("detailed summary also contains Why This Matters section", async () => {
    mockGenerateJSON.mockResolvedValueOnce(mockDetailedOutput);

    const result = await generateSummary(techCrunchItem.id, {
      length: "detailed",
    });

    expect(result.summary).toContain("Why This Matters");
    expect(result.summary).toContain("Notable Quotes");
  });

  it("returns cached=false on first generation and cached=true on second call", async () => {
    const first = await generateSummary(techCrunchItem.id, { length: "brief" });
    expect(first.cached).toBe(false);

    mockGetAISummary.mockReturnValue({
      id: "sum-new-1",
      item_id: techCrunchItem.id,
      summary: mockBriefSummary,
      model: "gemini-2.5-flash",
      prompt_type: "brief",
      created_at: new Date().toISOString(),
    });

    const second = await generateSummary(techCrunchItem.id, { length: "brief" });
    expect(second.cached).toBe(true);
    expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
  });
});
