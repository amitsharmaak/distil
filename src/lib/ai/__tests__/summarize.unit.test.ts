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
  createTenantAIRouter: jest.fn(),
  getEffectiveModel: jest.fn(() => ({ model: "gemini-3.5-flash-lite" })),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { generateSummary } from "../summarize";
import { createTenantAIRouter, getEffectiveModel } from "../router";
import { createAuthContext } from "@/lib/contracts/tenant-context";
import type { RepositorySet } from "@/lib/repositories/ports";
import type { ContentItem } from "@/lib/types";

// Typed mock helpers.
const mockCreateTenantAIRouter = createTenantAIRouter as jest.Mock;
const mockGetEffectiveModel = getEffectiveModel as jest.Mock;
const mockGenerateJSON = jest.fn();

const context = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000001",
  actorKind: "user",
  actorId: "10000000-0000-4000-8000-000000000001",
  requestId: "30000000-0000-4000-8000-000000000001",
});

const repositories = {
  summaries: { find: jest.fn(), upsert: jest.fn() },
  items: { findById: jest.fn() },
} as unknown as RepositorySet;
const mockGetAISummary = repositories.summaries.find as jest.Mock;
const mockUpsertAISummary = repositories.summaries.upsert as jest.Mock;
const mockGetItemById = repositories.items.findById as jest.Mock;

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
  shape: "news",
  overview:
    "Anthropic has launched voice mode for Claude Code, enabling hands-free coding via speech-to-text integration. The feature is available to all Claude Code users as of March 2026.",
  sections: [
    {
      heading: "What changes for developers",
      format: "bullets",
      items: [
        "Voice commands now drive code navigation, editing, and terminal interactions",
        "Available in the CLI with no extra configuration required",
      ],
    },
    {
      heading: "Getting started",
      format: "steps",
      items: ["Update Claude Code", "Grant microphone access"],
    },
  ],
  openQuestions: ["How accurate is the ASR on code identifiers?"],
};

// The detailed delta over mockBriefOutput.
const mockDeltaOutput = {
  sections: [
    {
      heading: "How recognition handles code",
      deepens: "How accurate is the ASR on code identifiers?",
      format: "bullets",
      items: ["The ASR model is tuned on programming vocabulary such as camelCase names."],
    },
    {
      heading: "Platforms",
      deepens: "",
      format: "paragraph",
      items: ["It works on macOS, Linux and Windows."],
    },
  ],
};

// Rendered markdown (what gets stored and returned).
const mockBriefSummary = `## TL;DR

Anthropic has launched voice mode for Claude Code, enabling hands-free coding via speech-to-text integration. The feature is available to all Claude Code users as of March 2026.

## What changes for developers

- Voice commands now drive code navigation, editing, and terminal interactions
- Available in the CLI with no extra configuration required

## Getting started

1. Update Claude Code
2. Grant microphone access`;

const mockDetailedSummary = `${mockBriefSummary}

## Going deeper

## How recognition handles code

_Expands on: How accurate is the ASR on code identifiers?_

- The ASR model is tuned on programming vocabulary such as camelCase names.

## Platforms

It works on macOS, Linux and Windows.`;

/** A stored summary-v2 brief row. */
function briefRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "brief-1",
    itemId: techCrunchItem.id,
    summary: mockBriefSummary,
    model: "gemini-3.5-flash-lite",
    promptType: "brief",
    createdAt: new Date(Date.now() - 120_000).toISOString(),
    structured: mockBriefOutput,
    promptVersion: "summary-v2",
    ...overrides,
  };
}

/** A stored summary-v2 detailed row built from `briefId`. */
function detailedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "detailed-1",
    itemId: techCrunchItem.id,
    summary: mockDetailedSummary,
    model: "gemini-3.5-flash",
    promptType: "detailed",
    createdAt: new Date(Date.now() - 90_000).toISOString(),
    structured: { briefId: "brief-1", sections: mockDeltaOutput.sections },
    promptVersion: "summary-v2",
    ...overrides,
  };
}

function storedRows(rows: { brief?: unknown; detailed?: unknown }) {
  mockGetAISummary.mockImplementation((_id: string, type?: string) =>
    type === "brief" ? rows.brief : type === "detailed" ? rows.detailed : undefined
  );
}

/** Answer brief prompts with the brief and detailed prompts with the delta. */
function answerByPrompt(notes = ["A note"]) {
  mockGenerateJSON.mockImplementation(async (prompt: string) =>
    prompt.includes("taking notes on part")
      ? { notes }
      : prompt.includes("Going deeper")
        ? mockDeltaOutput
        : mockBriefOutput
  );
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateTenantAIRouter.mockReturnValue({
    generateJSONWithMetadata: async (...args: unknown[]) => ({
      value: await mockGenerateJSON(...args),
      model: mockGetEffectiveModel().model,
      provider: "gemini",
    }),
  });
  mockGetEffectiveModel.mockReturnValue({ model: "gemini-3.5-flash-lite" });

  // Defaults: no cached summary, item found in DB, generateJSON returns brief output.
  // techCrunchItem has ~200 chars in summary → ~50 tokens → uses "summarize" task.
  mockGetAISummary.mockReturnValue(undefined);
  mockGetItemById.mockReturnValue(techCrunchItem);
  mockGenerateJSON.mockResolvedValue(mockBriefOutput);
});

// ── Cache behaviour ───────────────────────────────────────────────────────────

describe("generateSummary — cache behaviour", () => {
  it("fails closed when tenant context and repositories are omitted", async () => {
    await expect(generateSummary(techCrunchItem.id)).rejects.toThrow(
      "Tenant context and repositories are required for summary generation"
    );
  });

  it("returns cached summary and skips the API when cache exists for the same length", async () => {
    mockGetAISummary.mockReturnValue({
      id: "sum-cached-1",
      item_id: techCrunchItem.id,
      summary: mockBriefSummary,
      model: "gemini-3.5-flash-lite",
      prompt_type: "brief",
      created_at: new Date().toISOString(),
    });

    const result = await generateSummary(context, repositories, techCrunchItem.id, {
      length: "brief",
    });

    expect(result.cached).toBe(true);
    expect(result.summary).toBe(mockBriefSummary);
    expect(mockGenerateJSON).not.toHaveBeenCalled();
  });

  it("calls the API when no cached summary exists", async () => {
    mockGetAISummary.mockReturnValue(undefined);

    const result = await generateSummary(context, repositories, techCrunchItem.id, {
      length: "brief",
    });

    expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
    expect(result.cached).toBe(false);
    expect(result.summary).toBe(mockBriefSummary);
  });

  it("bypasses cache when force=true and regenerates from the API", async () => {
    mockGetAISummary.mockReturnValue({
      id: "sum-cached-2",
      item_id: techCrunchItem.id,
      summary: "Old brief summary that should be ignored.",
      model: "gemini-3.5-flash-lite",
      prompt_type: "brief",
      createdAt: new Date(Date.now() - 61_000).toISOString(),
    });

    const result = await generateSummary(context, repositories, techCrunchItem.id, {
      length: "brief",
      force: true,
    });

    expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
    expect(result.cached).toBe(false);
    expect(result.summary).toBe(mockBriefSummary);
  });

  it("serves the cached value during the 60-second force cooldown", async () => {
    mockGetAISummary
      .mockReturnValueOnce({
        id: "sum-cooldown-old",
        itemId: "cooldown-item",
        summary: "Old cached summary",
        model: "gemini-3.5-flash-lite",
        promptType: "brief",
        createdAt: new Date(Date.now() - 61_000).toISOString(),
      })
      .mockReturnValueOnce({
        id: "sum-cooldown-new",
        itemId: "cooldown-item",
        summary: "Cached cooldown summary",
        model: "gemini-3.5-flash-lite",
        promptType: "brief",
        createdAt: new Date().toISOString(),
      });

    await generateSummary(context, repositories, "cooldown-item", { length: "brief", force: true });
    const second = await generateSummary(context, repositories, "cooldown-item", {
      length: "brief",
      force: true,
    });

    expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ summary: "Cached cooldown summary", cached: true });
  });

  it("does not serve a cached brief for a detailed request", async () => {
    storedRows({ brief: briefRow() });
    answerByPrompt();

    const result = await generateSummary(context, repositories, techCrunchItem.id, {
      length: "detailed",
    });

    expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
    expect(result.cached).toBe(false);
    expect(result.summary).toBe(mockDetailedSummary);
  });
});

// ── Generation ────────────────────────────────────────────────────────────────

describe("generateSummary — generation", () => {
  it("limits long-document chunk generation to three concurrent calls", async () => {
    const paragraph = "Long-form source material. ".repeat(500);
    mockGetItemById.mockReturnValue({
      ...techCrunchItem,
      id: "long-item",
      fullContent: Array.from({ length: 12 }, () => paragraph).join("\n\n"),
    });
    let active = 0;
    let peak = 0;
    mockGenerateJSON.mockImplementation(async (prompt: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return prompt.includes("taking notes on part") ? { notes: ["A note"] } : mockBriefOutput;
    });

    await generateSummary(context, repositories, "long-item", { length: "brief" });

    expect(peak).toBe(3);
    expect(mockGenerateJSON.mock.calls.length).toBeGreaterThan(3);
  });
  it("stores the generated summary in the DB cache", async () => {
    await generateSummary(context, repositories, techCrunchItem.id, { length: "brief" });

    expect(mockUpsertAISummary).toHaveBeenCalledTimes(1);
    expect(mockUpsertAISummary).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: techCrunchItem.id,
        summary: mockBriefSummary,
        promptType: "brief",
        model: "gemini-3.5-flash-lite",
      })
    );
  });

  it("persists model name in the DB cache entry", async () => {
    await generateSummary(context, repositories, techCrunchItem.id, { length: "brief" });

    const call = mockUpsertAISummary.mock.calls[0][0] as { model: string };
    expect(call.model).toBe("gemini-3.5-flash-lite");
  });

  it("stores a unique id with each upsert", async () => {
    await generateSummary(context, repositories, techCrunchItem.id, { length: "brief" });

    const call = mockUpsertAISummary.mock.calls[0][0] as { id: string };
    expect(typeof call.id).toBe("string");
    expect(call.id.length).toBeGreaterThan(0);
  });

  it("throws an error when the item does not exist in the DB", async () => {
    mockGetItemById.mockReturnValue(undefined);

    await expect(generateSummary(context, repositories, "nonexistent-item-id")).rejects.toThrow(
      "Item not found"
    );
  });

  it("includes the article title in the prompt sent to the AI", async () => {
    await generateSummary(context, repositories, techCrunchItem.id, { length: "brief" });

    const promptArg = mockGenerateJSON.mock.calls[0][0] as string;
    expect(promptArg).toContain(techCrunchItem.title);
  });

  it("includes the topics in the prompt sent to the AI", async () => {
    await generateSummary(context, repositories, techCrunchItem.id, { length: "brief" });

    const promptArg = mockGenerateJSON.mock.calls[0][0] as string;
    expect(promptArg).toContain("AI");
    expect(promptArg).toContain("Developer Tools");
  });

  it("defaults to 'brief' length when no options are provided", async () => {
    await generateSummary(context, repositories, techCrunchItem.id);

    const promptArg = mockGenerateJSON.mock.calls[0][0] as string;
    expect(promptArg).toContain("There is no fixed template");
    expect(promptArg).toContain("openQuestions");
  });
});

// ── TechCrunch article end-to-end ─────────────────────────────────────────────

describe("generateSummary — TechCrunch article fixture", () => {
  it("brief summary leads with TL;DR and uses the sections chosen for the piece", async () => {
    const result = await generateSummary(context, repositories, techCrunchItem.id, {
      length: "brief",
    });

    expect(result.summary.startsWith("## TL;DR\n\n")).toBe(true);
    expect(result.summary).toContain("## What changes for developers");
    expect(result.summary).toContain("1. Update Claude Code");
    expect(result.summary).not.toContain("Key Points");
    expect(result.summary).not.toContain("How accurate is the ASR");
  });

  it("detailed summary shows the brief once, then the delta under Going deeper", async () => {
    answerByPrompt();

    const result = await generateSummary(context, repositories, techCrunchItem.id, {
      length: "detailed",
    });

    expect(result.summary.match(/## TL;DR/g)).toHaveLength(1);
    expect(result.summary.indexOf("## What changes for developers")).toBeLessThan(
      result.summary.indexOf("## Going deeper")
    );
    expect(result.summary).not.toContain("Why This Matters");
  });

  it("returns cached=false on first generation and cached=true on second call", async () => {
    const first = await generateSummary(context, repositories, techCrunchItem.id, {
      length: "brief",
    });
    expect(first.cached).toBe(false);

    mockGetAISummary.mockReturnValue({
      id: "sum-new-1",
      item_id: techCrunchItem.id,
      summary: mockBriefSummary,
      model: "gemini-3.5-flash-lite",
      prompt_type: "brief",
      created_at: new Date().toISOString(),
    });

    const second = await generateSummary(context, repositories, techCrunchItem.id, {
      length: "brief",
    });
    expect(second.cached).toBe(true);
    expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
  });
});

describe("summary output safety", () => {
  it.each([
    { shape: "news", sections: [], openQuestions: [] },
    { shape: "news", overview: "  ", sections: [], openQuestions: [] },
    { shape: "news", overview: "ok", sections: "not a list", openQuestions: [] },
    { shape: "news", overview: "ok", sections: [{ format: "bullets", items: ["x"] }] },
  ])("rejects malformed brief output without caching it", async (output) => {
    mockGenerateJSON.mockResolvedValue(output);
    await expect(generateSummary(context, repositories, techCrunchItem.id)).rejects.toMatchObject({
      code: "AI_INVALID_OUTPUT",
    });
    expect(mockUpsertAISummary).not.toHaveBeenCalled();
  });
  it("caches the actual fallback model returned by the tenant router", async () => {
    mockGetEffectiveModel.mockReturnValue({ model: "gemini-3.1-flash-lite" });
    await generateSummary(context, repositories, techCrunchItem.id);
    expect(mockUpsertAISummary).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-3.1-flash-lite" })
    );
    expect(mockGenerateJSON.mock.calls[0][2].responseSchema.required).toEqual([
      "shape",
      "overview",
      "sections",
      "openQuestions",
    ]);
  });
});

describe("generateSummary — content-aware brief (summary-v2)", () => {
  it("stores the structured brief, its prompt version and a content hash", async () => {
    await generateSummary(context, repositories, techCrunchItem.id, { length: "brief" });

    const call = mockUpsertAISummary.mock.calls[0][0];
    expect(call.promptVersion).toBe("summary-v2");
    expect(call.structured).toEqual(mockBriefOutput);
    expect(call.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts an overview-only brief when the piece needs no sections", async () => {
    mockGenerateJSON.mockResolvedValue({
      shape: "other",
      overview: "A two-line note.",
      sections: [],
      openQuestions: [],
    });
    const result = await generateSummary(context, repositories, techCrunchItem.id);
    expect(result.summary).toBe("## TL;DR\n\nA two-line note.");
  });

  it("trims output beyond the caps instead of rejecting it", async () => {
    mockGenerateJSON.mockResolvedValue({
      shape: "not-a-shape",
      overview: "Overview.",
      sections: [
        { heading: "## One", format: "bullets", items: ["- a", "b", "c", "d"] },
        { heading: "Empty", format: "bullets", items: ["  "] },
        { heading: "Two", format: "unknown", items: ["e", "f", "g", "h"] },
        { heading: "Three", format: "paragraph", items: ["i", "j"] },
        { heading: "Four", format: "bullets", items: ["k"] },
      ],
      openQuestions: ["1", "2", "3", "4", "5", "6"],
    });
    const result = await generateSummary(context, repositories, techCrunchItem.id);
    const call = mockUpsertAISummary.mock.calls[0][0];

    expect(call.structured.shape).toBe("other");
    expect(call.structured.sections.map((s: { heading: string }) => s.heading)).toEqual([
      "## One",
      "Two",
    ]);
    expect(call.structured.sections.flatMap((s: { items: string[] }) => s.items)).toHaveLength(7);
    expect(call.structured.sections[1].format).toBe("bullets");
    expect(call.structured.openQuestions).toHaveLength(5);
    expect(result.summary).toContain("## One\n\n- a\n- b");
    expect(result.summary).not.toContain("Empty");
    expect(result.summary).not.toContain("Four");
  });

  it("renders quotes as block quotes and paragraphs as prose", async () => {
    mockGenerateJSON.mockResolvedValue({
      shape: "conversation",
      overview: "An interview.",
      sections: [
        { heading: "In their words", format: "quotes", items: ["We shipped it in a week."] },
        { heading: "Context", format: "paragraph", items: ["One short passage."] },
      ],
      openQuestions: [],
    });
    const result = await generateSummary(context, repositories, techCrunchItem.id);
    expect(result.summary).toContain("## In their words\n\n> We shipped it in a week.");
    expect(result.summary).toContain("## Context\n\nOne short passage.");
  });

  it("sends article text, not reader HTML, and sizes the request by the text", async () => {
    const markup = `<div class="${"x".repeat(9000)}"><h2>Launch</h2><p>Voice mode &amp; more.</p><ul><li>One</li><li>Two</li></ul></div>`;
    mockGetItemById.mockReturnValue({ ...techCrunchItem, fullContent: markup });

    await generateSummary(context, repositories, techCrunchItem.id);

    const [prompt, task] = mockGenerateJSON.mock.calls[0] as [string, string];
    expect(task).toBe("summarize");
    expect(prompt).toContain("## Launch\n\nVoice mode & more.\n\n- One\n- Two");
    expect(prompt).not.toContain("<p>");
    expect(prompt).not.toContain("xxxx");
  });

  it("writes long documents from chunk notes, brief and detailed alike", async () => {
    const paragraph = "Long-form source material. ".repeat(500);
    mockGetItemById.mockReturnValue({
      ...techCrunchItem,
      id: "long-item",
      fullContent: Array.from({ length: 12 }, () => paragraph).join("\n\n"),
    });
    answerByPrompt(["Specific note"]);

    await generateSummary(context, repositories, "long-item", { length: "brief" });
    let calls = mockGenerateJSON.mock.calls as [string, string][];
    let [finalPrompt, finalTask] = calls[calls.length - 1];
    expect(finalTask).toBe("summarize-complex");
    expect(finalPrompt).toContain("There is no fixed template");
    expect(finalPrompt).toContain("### Part 1\n- Specific note");

    // Detailed with no stored brief: the notes are taken once and feed the brief and the delta.
    mockGenerateJSON.mockClear();
    await generateSummary(context, repositories, "long-item", { length: "detailed" });
    calls = mockGenerateJSON.mock.calls as [string, string][];
    const noteCalls = calls.filter(([prompt]) => prompt.includes("taking notes on part"));
    expect(noteCalls.length).toBe(calls.length - 2);
    [finalPrompt, finalTask] = calls[calls.length - 1];
    expect(finalTask).toBe("summarize-complex");
    expect(finalPrompt).toContain("Going deeper");
    expect(finalPrompt).toContain("Notes From Each Part Of A Long Document");
    expect(finalPrompt).toContain("### Part 1\n- Specific note");
  });
});

describe("generateSummary — detailed as a delta over the brief (summary-v2)", () => {
  it("writes the delta over the stored brief with summarize-complex, even for short items", async () => {
    storedRows({ brief: briefRow() });
    answerByPrompt();

    const result = await generateSummary(context, repositories, techCrunchItem.id, {
      length: "detailed",
    });

    expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
    const [prompt, task, options] = mockGenerateJSON.mock.calls[0];
    expect(task).toBe("summarize-complex");
    expect(prompt).toContain("The brief (the reader has already read this)");
    expect(prompt).toContain(mockBriefOutput.overview);
    expect(prompt).toContain("1. How accurate is the ASR on code identifiers?");
    expect(options.responseSchema.required).toEqual(["sections"]);

    expect(mockUpsertAISummary).toHaveBeenCalledTimes(1);
    const call = mockUpsertAISummary.mock.calls[0][0];
    expect(call.promptType).toBe("detailed");
    expect(call.promptVersion).toBe("summary-v2");
    expect(call.structured).toEqual({
      briefId: "brief-1",
      sections: [
        mockDeltaOutput.sections[0],
        {
          heading: "Platforms",
          format: "paragraph",
          items: ["It works on macOS, Linux and Windows."],
        },
      ],
    });
    expect(call.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result).toEqual({ summary: mockDetailedSummary, cached: false });
  });

  it.each([
    ["missing", undefined],
    [
      "a pre-S2 brief without structure",
      briefRow({ structured: undefined, promptVersion: undefined }),
    ],
  ])("generates and stores the brief first when it is %s", async (_label, brief) => {
    storedRows({ brief });
    answerByPrompt();

    const result = await generateSummary(context, repositories, techCrunchItem.id, {
      length: "detailed",
    });

    const tasks = mockGenerateJSON.mock.calls.map((call) => call[1]);
    expect(tasks).toEqual(["summarize", "summarize-complex"]);
    expect(mockGenerateJSON.mock.calls[0][0]).toContain("There is no fixed template");
    const [storedBrief, storedDetailed] = mockUpsertAISummary.mock.calls.map((call) => call[0]);
    expect(storedBrief).toMatchObject({ promptType: "brief", promptVersion: "summary-v2" });
    expect(storedDetailed.promptType).toBe("detailed");
    expect(storedDetailed.structured.briefId).toBe(storedBrief.id);
    expect(result.brief).toBe(mockBriefSummary);
    expect(result.summary).toBe(mockDetailedSummary);
  });

  it("serves a detailed summary that belongs to the stored brief from cache", async () => {
    storedRows({ brief: briefRow(), detailed: detailedRow() });

    const result = await generateSummary(context, repositories, techCrunchItem.id, {
      length: "detailed",
    });

    expect(result).toEqual({ summary: mockDetailedSummary, cached: true });
    expect(mockGenerateJSON).not.toHaveBeenCalled();
  });

  it("rebuilds a detailed summary once its brief has been regenerated", async () => {
    storedRows({ brief: briefRow({ id: "brief-2" }), detailed: detailedRow() });
    answerByPrompt();

    const result = await generateSummary(context, repositories, techCrunchItem.id, {
      length: "detailed",
    });

    expect(result.cached).toBe(false);
    expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
    expect(mockUpsertAISummary.mock.calls[0][0].structured.briefId).toBe("brief-2");
  });

  it("keeps a pre-S2 detailed summary until the brief is regenerated after it", async () => {
    const oldDetailed = detailedRow({
      summary: "## TL;DR\n\nOld detailed",
      structured: undefined,
      promptVersion: undefined,
    });
    storedRows({ brief: briefRow(), detailed: oldDetailed });
    await expect(
      generateSummary(context, repositories, techCrunchItem.id, { length: "detailed" })
    ).resolves.toEqual({ summary: "## TL;DR\n\nOld detailed", cached: true });

    storedRows({ brief: briefRow({ createdAt: new Date().toISOString() }), detailed: oldDetailed });
    answerByPrompt();
    const rebuilt = await generateSummary(context, repositories, techCrunchItem.id, {
      length: "detailed",
    });
    expect(rebuilt.cached).toBe(false);
  });

  it("honours the force cooldown only for a current detailed summary", async () => {
    storedRows({
      brief: briefRow(),
      detailed: detailedRow({ createdAt: new Date().toISOString() }),
    });
    const cooled = await generateSummary(context, repositories, techCrunchItem.id, {
      length: "detailed",
      force: true,
    });
    expect(cooled.cached).toBe(true);

    storedRows({ brief: briefRow({ id: "brief-2" }), detailed: detailedRow() });
    answerByPrompt();
    const forced = await generateSummary(context, repositories, techCrunchItem.id, {
      length: "detailed",
      force: true,
    });
    expect(forced.cached).toBe(false);
  });

  it.each([
    { sections: [] },
    { sections: [{ heading: "Empty", format: "bullets", items: [" "] }] },
    {},
  ])("rejects an empty or malformed delta without caching it", async (output) => {
    storedRows({ brief: briefRow() });
    mockGenerateJSON.mockResolvedValue(output);
    await expect(
      generateSummary(context, repositories, techCrunchItem.id, { length: "detailed" })
    ).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
    expect(mockUpsertAISummary).not.toHaveBeenCalled();
  });
});
