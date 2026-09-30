jest.mock("@/lib/queue/research-dispatch", () => ({ resolveResearchDispatcher: jest.fn() }));
jest.mock("../router", () => ({
  createTenantAIRouter: jest.fn(),
  getEffectiveModel: jest.fn(() => ({ provider: "gemini", model: "gemini-test" })),
}));
jest.mock("@/lib/database", () => ({ getTenantRepositories: jest.fn() }));

import { createTenantAIRouter } from "../router";
import { getTenantRepositories } from "@/lib/database";
import { createResearchRunMessageV1 } from "@/lib/contracts/tenant-jobs";
import { consumeResearchRunMessage } from "@/lib/queue/research-consumer";
import {
  failStaleReport,
  MAX_STAGE_ATTEMPTS,
  nextResearchStage,
  parseResearchRunState,
  publicResearchProgress,
  RESEARCH_STAGE_DEADLINE_MS,
  RESEARCH_OUTLINE_OPTIONS,
  RESEARCH_TIMEOUTS_MS,
  RESEARCH_WRITE_OPTIONS,
  ResearchStageRetryError,
  ResearchStageTimeoutError,
  withStageDeadline,
  runResearchStage,
  STALE_RESEARCH_MS,
  startResearch,
  type ResearchAI,
  type ResearchRunState,
  type ResearchRunStateV1,
  type ResearchRunStateV2,
} from "../research";
import type { FindingSource, ResearchSource } from "../research-sources";
import {
  countSectionWords,
  MAX_REPORT_WORDS,
  MAX_SECTION_WORDS,
  sectionWordBudget,
} from "../research-report";
import { createAuthContext } from "@/lib/contracts/tenant-context";
import { FakeResearchDispatcher } from "@/lib/queue/dispatchers";
import type { RepositorySet, ResearchReportRecord } from "@/lib/repositories/ports";

const context = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000001",
  actorId: "00000000-0000-4000-8000-000000000006",
  actorKind: "system",
  requestId: "30000000-0000-4000-8000-000000000001",
});

/** In-memory research repository with the same patch semantics as PostgreSQL. */
function createRepositories(items: Record<string, { title: string; summary?: string }> = {}) {
  const reports = new Map<string, ResearchReportRecord>();
  const research = {
    insertReport: jest.fn(
      async (input: { id: string; query: string; model: string; itemId?: string }) => {
        const record: ResearchReportRecord = {
          id: input.id,
          itemId: input.itemId,
          query: input.query,
          report: "",
          sources: "[]",
          model: input.model,
          status: "pending",
          createdAt: "2026-09-21T10:00:00.000Z",
          progress: null,
        };
        reports.set(input.id, record);
        return record;
      }
    ),
    findReport: jest.fn(async (id: string) => reports.get(id)),
    updateReport: jest.fn(async (id: string, patch: Partial<ResearchReportRecord>) => {
      const current = reports.get(id);
      if (!current) return undefined;
      const updated = { ...current, ...patch };
      reports.set(id, updated);
      return updated;
    }),
  };
  const repositories = {
    research,
    items: { findById: jest.fn(async (id: string) => items[id]) },
  } as unknown as RepositorySet;
  return { repositories, reports, research };
}

type SearchPromptArg = Parameters<ResearchAI["generateTextWithSearch"]>[0];

/** The question a notes prompt asks about (the line after "## Question"). */
function promptQuestion(prompt: SearchPromptArg): string {
  const text = typeof prompt === "string" ? prompt : prompt.ungrounded;
  return text.match(/## Question\n(.+)/)?.[1] ?? "";
}

/** Ungrounded answer whose trailing block recalls one source per question. */
function recalledAnswer(prompt: SearchPromptArg) {
  const question = promptQuestion(prompt);
  const url = `https://example.com/${encodeURIComponent(question)}`;
  return {
    text: `- Fact about ${question} (2025).\n\n\`\`\`sources\n[{"title": "About ${question}", "url": "${url}"}]\n\`\`\``,
    sources: [],
    grounded: false,
  };
}

/** A section body long enough to pass the minimum-length guard. */
function body(lead: string, words = 70): string {
  return `${lead} ${Array.from({ length: words }, (_, index) => `word${index}`).join(" ")}.`;
}

/** Outline the model returns by default: F numbers refer to the usable findings in order. */
function modelOutline(overrides: Record<string, unknown> = {}) {
  return {
    shape: "comparison",
    tldr: "Short answer drawn from Q2 [2].",
    takeaways: ["First fact from Q1 [1].", "A fact with an unknown source [9]."],
    sections: [
      {
        heading: "How Q1 works",
        purpose: "Explain Q1.",
        findings: [1],
        sourceIds: [1],
        format: "prose",
      },
      {
        heading: "Q2 and the gap side by side",
        purpose: "Compare.",
        findings: [2, 3],
        sourceIds: [2, 3],
        format: "table",
      },
    ],
    caveats: ["The gap evidence is thin [3]."],
    ...overrides,
  };
}

/** The heading a section prompt is written for. */
function sectionHeading(prompt: string): string {
  return prompt.match(/^Heading: (.+)$/m)?.[1] ?? "";
}

function createAI(overrides: Partial<ResearchAI> = {}): jest.Mocked<ResearchAI> {
  return {
    generateText: jest.fn(async (prompt: string, task: string) => {
      if (task === "research-plan") return JSON.stringify(["Q1", "Q2"]);
      if (task === "research-synthesize") return body(`About ${sectionHeading(prompt)} [1].`);
      return "text";
    }),
    generateJSON: jest.fn(async (_prompt: string, task: string) =>
      task === "research-synthesize" ? modelOutline() : { gaps: ["Gap A"] }
    ),
    generateTextWithSearch: jest.fn(async (prompt: SearchPromptArg) => recalledAnswer(prompt)),
    ...overrides,
  } as jest.Mocked<ResearchAI>;
}

/** A version 3 state whose findings are complete and whose next stage is the outline. */
function readyForOutline(overrides: Partial<ResearchRunState> = {}): ResearchRunState {
  return {
    version: 3,
    updatedAt: "2026-09-30T10:01:00.000Z",
    view: { stage: "outlining" },
    subQuestions: ["Q1", "Q2"],
    findings: [
      finding("Q1", "- Q1 fact one.\n- Q1 fact two here.", [
        { url: "https://a.example/1", title: "A1" },
      ]),
      finding("Q2", "- Q2 fact one is here.", [{ url: "https://b.example/2", title: "B2" }]),
    ],
    gaps: [],
    deepening: [],
    sections: [],
    attempts: {},
    ...overrides,
  };
}

async function seedState(repositories: RepositorySet, state: object) {
  const { id } = await seedReport(repositories);
  await repositories.research.updateReport(id, {
    status: "running",
    progress: JSON.stringify(state),
  });
  return id;
}

function finding(question: string, notes = "done", sources: FindingSource[] = []) {
  return { question, notes, sources, grounded: false };
}

const reportId = "a1b2c3d4-e5f6-4789-a123-456789abcdef";

async function seedReport(repositories: RepositorySet, itemId?: string) {
  const dispatcher = new FakeResearchDispatcher();
  const id = await startResearch(context, repositories, "Why is the sky blue?", itemId, dispatcher);
  return { id, dispatcher };
}

describe("startResearch", () => {
  it("creates the report with a planning view and publishes exactly the plan stage", async () => {
    const { repositories, reports } = createRepositories();
    const { id, dispatcher } = await seedReport(repositories);
    expect(reports.get(id)?.status).toBe("pending");
    expect(publicResearchProgress(reports.get(id)?.progress)).toEqual({ stage: "planning" });
    expect(dispatcher.messages).toEqual([
      {
        message: expect.objectContaining({
          version: 1,
          reportId: id,
          step: "plan",
          userId: context.userId,
        }),
        idempotencyKey: `research:${id}:plan:0`,
      },
    ]);
  });

  it("marks the report failed when the stage cannot be published", async () => {
    const { repositories, reports } = createRepositories();
    const dispatcher = new FakeResearchDispatcher();
    dispatcher.failure = new Error("queue unavailable");
    await expect(startResearch(context, repositories, "q", undefined, dispatcher)).rejects.toThrow(
      "queue unavailable"
    );
    const [report] = [...reports.values()];
    expect(report.status).toBe("failed");
    expect(report.progress).toBeNull();
  });
});

describe("runResearchStage", () => {
  it("walks plan → search × n → gaps → deepen × m → outline → write × k, one stage per call", async () => {
    const { repositories, reports } = createRepositories({
      "item-1": { title: "Sky", summary: "Rayleigh scattering" },
    });
    const { id } = await seedReport(repositories, "item-1");
    const ai = createAI();
    const run = () => runResearchStage({ context, repositories, reportId: id, ai });

    await expect(run()).resolves.toEqual({
      outcome: "ran",
      stage: { kind: "plan" },
      next: { kind: "search", index: 0 },
    });
    expect(ai.generateText).toHaveBeenCalledWith(
      expect.stringContaining("Rayleigh scattering"),
      "research-plan",
      { timeoutMs: 30_000, maxAttempts: 1, signal: expect.any(AbortSignal) }
    );
    expect(reports.get(id)?.status).toBe("running");
    expect(publicResearchProgress(reports.get(id)?.progress)).toEqual({
      stage: "researching",
      current: 0,
      total: 2,
      question: "Q1",
    });

    await expect(run()).resolves.toMatchObject({
      stage: { kind: "search", index: 0 },
      next: { kind: "search", index: 1 },
    });
    expect(ai.generateTextWithSearch).toHaveBeenLastCalledWith(
      {
        grounded: expect.stringContaining("Q1"),
        ungrounded: expect.stringContaining("Q1"),
      },
      { timeoutMs: 45_000, maxTokens: 2048, maxAttempts: 1, signal: expect.any(AbortSignal) }
    );
    const searchPrompt = ai.generateTextWithSearch.mock.calls.at(-1)![0] as {
      grounded: string;
      ungrounded: string;
    };
    expect(searchPrompt.grounded).toContain("Do not put URLs");
    expect(searchPrompt.grounded).not.toContain("```sources");
    expect(searchPrompt.ungrounded).toContain("```sources");
    expect(parseResearchRunState(reports.get(id)?.progress, "").findings[0]).toEqual({
      question: "Q1",
      notes: "- Fact about Q1 (2025).",
      sources: [{ url: "https://example.com/Q1", title: "About Q1" }],
      grounded: false,
    });
    expect(publicResearchProgress(reports.get(id)?.progress)).toMatchObject({
      stage: "researching",
      current: 1,
      total: 2,
      question: "Q1",
    });

    await expect(run()).resolves.toMatchObject({
      stage: { kind: "search", index: 1 },
      next: { kind: "gaps" },
    });
    await expect(run()).resolves.toMatchObject({
      stage: { kind: "gaps" },
      next: { kind: "deepen", index: 0 },
    });
    expect(ai.generateJSON).toHaveBeenCalledWith(expect.stringContaining("Q1"), "research-gaps", {
      timeoutMs: 30_000,
      maxAttempts: 1,
      signal: expect.any(AbortSignal),
    });
    expect(publicResearchProgress(reports.get(id)?.progress)).toEqual({
      stage: "deepening",
      current: 0,
      total: 1,
      question: "Gap A",
    });

    await expect(run()).resolves.toMatchObject({
      stage: { kind: "deepen", index: 0 },
      next: { kind: "outline" },
    });
    expect(ai.generateTextWithSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ grounded: expect.stringContaining("Gap A") }),
      { timeoutMs: 45_000, maxTokens: 2048, maxAttempts: 1, signal: expect.any(AbortSignal) }
    );
    expect(publicResearchProgress(reports.get(id)?.progress)).toEqual({ stage: "outlining" });

    // Outline: one JSON call over the numbered findings and their sources.
    await expect(run()).resolves.toEqual({
      outcome: "ran",
      stage: { kind: "outline" },
      next: { kind: "write", index: 0 },
    });
    const outlineCall = ai.generateJSON.mock.calls.at(-1)!;
    expect(outlineCall[1]).toBe("research-synthesize");
    expect(outlineCall[2]).toEqual({
      timeoutMs: 40_000,
      maxTokens: 2_500,
      rejectTruncated: true,
      providerOverrides: { gemini: { maxTokens: 6_000, thinking: "low" } },
      responseSchema: expect.objectContaining({ required: expect.arrayContaining(["sections"]) }),
      maxAttempts: 1,
      signal: expect.any(AbortSignal),
    });
    const outlinePrompt = outlineCall[0];
    expect(outlinePrompt).toContain(
      "### F1. Q1\n\nSources: [1] About Q1 — example.com\n\n- Fact about Q1"
    );
    expect(outlinePrompt).toContain("### F2. Q2\n\nSources: [2] About Q2 — example.com");
    expect(outlinePrompt).toContain("### F3. Gap A\n\nSources: [3] About Gap A — example.com");
    expect(outlinePrompt).not.toContain("```sources");
    const state = parseResearchRunState(reports.get(id)?.progress, "");
    expect(state.version).toBe(3);
    expect(state.outline).toMatchObject({
      shape: "comparison",
      sections: [
        { heading: "How Q1 works", findings: [0], sourceIds: [1], format: "prose" },
        { heading: "Q2 and the gap side by side", findings: [1, 2], sourceIds: [2, 3] },
      ],
    });
    expect(state.sections).toEqual([null, null]);
    expect(publicResearchProgress(reports.get(id)?.progress)).toEqual({
      stage: "writing",
      current: 1,
      total: 2,
      heading: "How Q1 works",
    });

    // Write 1 of 2: only that section's findings.
    await expect(run()).resolves.toEqual({
      outcome: "ran",
      stage: { kind: "write", index: 0 },
      next: { kind: "write", index: 1 },
    });
    const writeCall = ai.generateText.mock.calls.at(-1)!;
    expect(writeCall[1]).toBe("research-synthesize");
    expect(writeCall[2]).toEqual({
      timeoutMs: 40_000,
      maxTokens: 2_000,
      rejectTruncated: true,
      providerOverrides: { gemini: { maxTokens: 5_000, thinking: "low" } },
      maxAttempts: 1,
      signal: expect.any(AbortSignal),
    });
    expect(writeCall[0]).toContain("Heading: How Q1 works");
    expect(writeCall[0]).toContain("Sources: [1] About Q1 — example.com");
    expect(writeCall[0]).not.toContain("Fact about Q2");
    expect(publicResearchProgress(reports.get(id)?.progress)).toEqual({
      stage: "writing",
      current: 2,
      total: 2,
      heading: "Q2 and the gap side by side",
    });

    // Write 2 of 2 (a table section) completes and assembles the report.
    ai.generateText.mockImplementationOnce(
      async () =>
        `## Q2 and the gap side by side\n\nIntro sentence [3].\n\n| Option | Fact |\n| --- | --- |\n| Q2 | x [2] |\n| Gap | y [3] |\n\n${body("Closing")}\n\nSources:\n- [2] About Q2`
    );
    await expect(run()).resolves.toEqual({
      outcome: "ran",
      stage: { kind: "write", index: 1 },
      next: null,
    });
    const tablePrompt = ai.generateText.mock.calls.at(-1)![0];
    expect(tablePrompt).toContain("GitHub-flavoured markdown table");
    expect(tablePrompt).toContain("Fact about Q2");
    expect(tablePrompt).toContain("Fact about Gap A");
    expect(tablePrompt).not.toContain("Fact about Q1");

    const final = reports.get(id)!;
    expect(final.status).toBe("completed");
    expect(final.progress).toBeNull();
    expect(final.completedAt).toBeDefined();
    // TL;DR cites [2] first, then takeaways [1]; [9] is not in the catalog and is dropped.
    expect(final.report).toBe(
      [
        "## TL;DR",
        "Short answer drawn from Q2 [1].",
        "## Key takeaways",
        "- First fact from Q1 [2].\n- A fact with an unknown source.",
        "## How Q1 works",
        body("About How Q1 works [2]."),
        "## Q2 and the gap side by side",
        `Intro sentence [3].\n\n| Option | Fact |\n| --- | --- |\n| Q2 | x [1] |\n| Gap | y [3] |\n\n${body("Closing")}`,
        "## Caveats and open questions",
        "- The gap evidence is thin [3].",
      ].join("\n\n") + "\n"
    );
    expect(JSON.parse(final.sources)).toEqual<ResearchSource[]>([
      {
        id: 1,
        url: "https://example.com/Q2",
        title: "About Q2",
        domain: "example.com",
        grounded: false,
      },
      {
        id: 2,
        url: "https://example.com/Q1",
        title: "About Q1",
        domain: "example.com",
        grounded: false,
      },
      {
        id: 3,
        url: "https://example.com/Gap%20A",
        title: "About Gap A",
        domain: "example.com",
        grounded: false,
      },
    ]);
    // Model calls: plan, 2 searches, gaps, 1 deepen, outline, 2 writes.
    expect(ai.generateText).toHaveBeenCalledTimes(3);
    expect(ai.generateJSON).toHaveBeenCalledTimes(2);
    expect(ai.generateTextWithSearch).toHaveBeenCalledTimes(3);

    // A late duplicate delivery acknowledges without touching the model.
    await expect(run()).resolves.toEqual({ outcome: "skipped", reason: "terminal" });
    expect(ai.generateText).toHaveBeenCalledTimes(3);
  });

  it("resumes a redelivered message from the first unfinished stage instead of restarting", async () => {
    const { repositories, reports } = createRepositories();
    const { id } = await seedReport(repositories);
    const ai = createAI();
    // Written by R2 (version 2) before the upgrade.
    const partial: ResearchRunStateV2 = {
      version: 2,
      updatedAt: "2026-09-21T10:01:00.000Z",
      view: { stage: "researching", current: 1, total: 2, question: "Q1" },
      subQuestions: ["Q1", "Q2"],
      findings: [finding("Q1", "already done"), null],
      deepening: [],
      attempts: {},
    };
    await repositories.research.updateReport(id, {
      status: "running",
      progress: JSON.stringify(partial),
    });

    // The message that produced findings[0] is delivered a second time.
    await expect(
      runResearchStage({ context, repositories, reportId: id, ai })
    ).resolves.toMatchObject({
      stage: { kind: "search", index: 1 },
      next: { kind: "gaps" },
    });
    expect(ai.generateText).not.toHaveBeenCalled();
    expect(ai.generateTextWithSearch).toHaveBeenCalledTimes(1);
    expect(ai.generateTextWithSearch).toHaveBeenCalledWith(
      expect.objectContaining({ grounded: expect.stringContaining("Q2") }),
      expect.anything()
    );
    const state = parseResearchRunState(reports.get(id)?.progress, "");
    expect(state.findings[0]).toEqual(finding("Q1", "already done"));
    expect(state.findings[1]).toMatchObject({ question: "Q2", grounded: false });
    expect(JSON.parse(reports.get(id)!.progress!)).toMatchObject({ version: 3, sections: [] });
  });

  it("finishes a run whose state was written as version 1 before the upgrade", async () => {
    const { repositories, reports } = createRepositories();
    const { id } = await seedReport(repositories);
    const ai = createAI();
    const legacy: ResearchRunStateV1 = {
      version: 1,
      updatedAt: "2026-09-21T10:01:00.000Z",
      view: { stage: "researching", current: 1, total: 2, question: "Q1" },
      subQuestions: ["Q1", "Q2"],
      findings: ["## Q1\n\nalready done, see https://old.example/a).", null],
      deepening: [],
      attempts: { "search:1": 1 },
    };
    await repositories.research.updateReport(id, {
      status: "running",
      progress: JSON.stringify(legacy),
    });

    await expect(
      runResearchStage({ context, repositories, reportId: id, ai })
    ).resolves.toMatchObject({ stage: { kind: "search", index: 1 }, next: { kind: "gaps" } });
    const stored = JSON.parse(reports.get(id)!.progress!) as ResearchRunState;
    expect(stored.version).toBe(3);
    expect(stored.attempts).toEqual({ "search:1": 1 });
    expect(stored.findings[0]).toEqual({
      question: "Q1",
      notes: "already done, see https://old.example/a).",
      sources: [{ url: "https://old.example/a", title: "old.example" }],
      grounded: false,
    });
    expect(stored.findings[1]).toMatchObject({ question: "Q2" });
  });

  it("continues a version 1 state at synthesis with the outline and write stages", async () => {
    const { repositories, reports } = createRepositories();
    const { id } = await seedReport(repositories);
    const legacy: ResearchRunStateV1 = {
      version: 1,
      updatedAt: "2026-09-21T10:01:00.000Z",
      view: { stage: "synthesizing" },
      subQuestions: ["Q1"],
      findings: ["## Q1\n\nA https://a.example/x and https://www.b.example/y"],
      gaps: ["G"],
      deepening: ["## G\n\n(Research on this gap failed.)"],
      attempts: {},
    };
    await repositories.research.updateReport(id, {
      status: "running",
      progress: JSON.stringify(legacy),
    });
    const ai = createAI({
      generateJSON: jest.fn().mockResolvedValue(
        modelOutline({
          tldr: "Answer [2].",
          takeaways: ["Only takeaway [2]."],
          caveats: [],
          sections: [
            {
              heading: "Q1 answered",
              purpose: "p",
              findings: [1],
              sourceIds: [2],
              format: "prose",
            },
          ],
        })
      ),
      generateText: jest.fn().mockResolvedValue(body("Claim [2].")),
    });
    await expect(
      runResearchStage({ context, repositories, reportId: id, ai })
    ).resolves.toMatchObject({ stage: { kind: "outline" }, next: { kind: "write", index: 0 } });
    // The failed gap finding is not offered to the outline.
    const outlinePrompt = ai.generateJSON.mock.calls[0]![0];
    expect(outlinePrompt).toContain("### F1. Q1\n\nSources: [1] a.example; [2] b.example");
    expect(outlinePrompt).not.toContain("### F2");
    await expect(
      runResearchStage({ context, repositories, reportId: id, ai })
    ).resolves.toMatchObject({ stage: { kind: "write", index: 0 }, next: null });
    const report = reports.get(id)!;
    expect(report.status).toBe("completed");
    expect(report.report).toBe(
      `## TL;DR\n\nAnswer [1].\n\n## Key takeaways\n\n- Only takeaway [1].\n\n## Q1 answered\n\n${body("Claim [1].")}\n`
    );
    expect(JSON.parse(report.sources)).toEqual([
      {
        id: 1,
        url: "https://www.b.example/y",
        title: "b.example",
        domain: "b.example",
        grounded: false,
      },
    ]);
  });

  it("keeps grounded sources, resolving Google redirect links to their final URLs", async () => {
    const { repositories, reports } = createRepositories();
    const { id } = await seedReport(repositories);
    const redirect = `https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC123`;
    const ai = createAI({
      generateText: jest.fn(async (_prompt: string, task: string) =>
        task === "research-plan" ? JSON.stringify(["Q1"]) : body("Grounded claim [1].")
      ),
      generateJSON: jest.fn(async (_prompt: string, task: string) =>
        task === "research-gaps" ? { gaps: [] } : modelOutline()
      ) as unknown as ResearchAI["generateJSON"],
      generateTextWithSearch: jest.fn(async () => ({
        text: "- Grounded fact.",
        sources: [{ url: redirect, title: "nature.com" }],
        grounded: true,
      })),
    });
    const fetchImpl = jest.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://www.nature.com/articles/s1" },
        })
    );
    const run = () => runResearchStage({ context, repositories, reportId: id, ai, fetchImpl });
    await run(); // plan
    await run(); // search
    expect(fetchImpl).toHaveBeenCalledWith(
      redirect,
      expect.objectContaining({ redirect: "manual" })
    );
    expect(parseResearchRunState(reports.get(id)?.progress, "").findings[0]).toEqual({
      question: "Q1",
      notes: "- Grounded fact.",
      sources: [{ url: "https://www.nature.com/articles/s1", title: "nature.com" }],
      grounded: true,
    });
    await run(); // gaps
    await run(); // outline
    await run(); // write 0
    await run(); // write 1 and assembly
    expect(reports.get(id)!.status).toBe("completed");
    expect(JSON.parse(reports.get(id)!.sources)).toEqual([
      {
        id: 1,
        url: "https://www.nature.com/articles/s1",
        title: "nature.com",
        domain: "nature.com",
        grounded: true,
      },
    ]);
  });

  it("keeps the notes and drops a malformed recalled-sources block", async () => {
    const { repositories, reports } = createRepositories();
    const { id } = await seedReport(repositories);
    const ai = createAI({
      generateTextWithSearch: jest.fn(async () => ({
        text: '- A fact.\n\nSources:\n```sources\n[{"title": "Broken", "url": \n```',
        sources: [],
        grounded: false,
      })),
    });
    await runResearchStage({ context, repositories, reportId: id, ai });
    await runResearchStage({ context, repositories, reportId: id, ai });
    expect(parseResearchRunState(reports.get(id)?.progress, "").findings[0]).toEqual(
      finding("Q1", "- A fact.")
    );
  });

  it("asks for redelivery on a failed stage and records the attempt durably", async () => {
    const { repositories, reports } = createRepositories();
    const { id } = await seedReport(repositories);
    const ai = createAI({
      generateTextWithSearch: jest.fn().mockRejectedValue(new Error("503 high demand")),
    });
    await runResearchStage({ context, repositories, reportId: id, ai });

    await expect(
      runResearchStage({ context, repositories, reportId: id, ai })
    ).rejects.toBeInstanceOf(ResearchStageRetryError);
    expect(parseResearchRunState(reports.get(id)?.progress, "").attempts).toEqual({
      "search:0": 1,
    });
    expect(reports.get(id)?.status).toBe("running");
  });

  it("records a placeholder finding once a search stage exhausts its attempts", async () => {
    const { repositories, reports } = createRepositories();
    const { id } = await seedReport(repositories);
    const ai = createAI({
      generateTextWithSearch: jest.fn().mockRejectedValue(new Error("503 high demand")),
    });
    await runResearchStage({ context, repositories, reportId: id, ai });
    for (let attempt = 1; attempt < MAX_STAGE_ATTEMPTS; attempt++) {
      await expect(
        runResearchStage({ context, repositories, reportId: id, ai })
      ).rejects.toBeInstanceOf(ResearchStageRetryError);
    }
    await expect(
      runResearchStage({ context, repositories, reportId: id, ai })
    ).resolves.toMatchObject({
      stage: { kind: "search", index: 0 },
      next: { kind: "search", index: 1 },
    });
    const state = parseResearchRunState(reports.get(id)?.progress, "");
    expect(state.findings[0]).toEqual(finding("Q1", "(Research on this question failed.)"));
    expect(state.view).toEqual({ stage: "researching", current: 1, total: 2, question: "Q1" });
  });

  it("falls back to the query itself when the plan is not a JSON array", async () => {
    const { repositories, reports } = createRepositories();
    const { id } = await seedReport(repositories);
    const ai = createAI({ generateText: jest.fn().mockResolvedValue("not json") });
    await expect(
      runResearchStage({ context, repositories, reportId: id, ai })
    ).resolves.toMatchObject({
      next: { kind: "search", index: 0 },
    });
    expect(parseResearchRunState(reports.get(id)?.progress, "").subQuestions).toEqual([
      "Why is the sky blue?",
    ]);
  });

  it("skips deepening when gap analysis fails", async () => {
    const { repositories, reports } = createRepositories();
    const { id } = await seedReport(repositories);
    const ai = createAI({
      generateText: jest.fn().mockResolvedValue(JSON.stringify(["Q1"])),
      generateJSON: jest.fn().mockRejectedValue(new Error("invalid_output")),
    });
    await runResearchStage({ context, repositories, reportId: id, ai });
    await runResearchStage({ context, repositories, reportId: id, ai });
    await expect(
      runResearchStage({ context, repositories, reportId: id, ai })
    ).resolves.toMatchObject({
      stage: { kind: "gaps" },
      next: { kind: "outline" },
    });
    expect(publicResearchProgress(reports.get(id)?.progress)).toEqual({ stage: "outlining" });
  });

  it("routes a redelivered synthesize message to the outline and publishes write 0", async () => {
    const { repositories, reports } = createRepositories();
    const id = await seedState(repositories, readyForOutline());
    const ai = createAI();
    jest.mocked(getTenantRepositories).mockResolvedValue(repositories);
    jest
      .mocked(createTenantAIRouter)
      .mockReturnValue(ai as unknown as ReturnType<typeof createTenantAIRouter>);
    const dispatcher = new FakeResearchDispatcher();
    // Published by a pre-R3 deployment; the consumer runs the first unfinished stage instead.
    await consumeResearchRunMessage(
      createResearchRunMessageV1({
        userId: context.userId,
        reportId: id,
        traceId: context.requestId,
        step: "synthesize",
      }),
      dispatcher
    );
    expect(ai.generateJSON).toHaveBeenCalledWith(
      expect.stringContaining("### F1. Q1"),
      "research-synthesize",
      expect.objectContaining({ maxAttempts: 1 })
    );
    expect(ai.generateText).not.toHaveBeenCalled();
    expect(parseResearchRunState(reports.get(id)?.progress, "").outline).toBeDefined();
    expect(dispatcher.messages).toEqual([
      {
        message: expect.objectContaining({ step: "write", index: 0, reportId: id }),
        idempotencyKey: `research:${id}:write:0`,
      },
    ]);
  });

  it("continues a version 2 run that was waiting for synthesis with the outline", async () => {
    const { repositories, reports } = createRepositories();
    const v2: ResearchRunStateV2 = {
      version: 2,
      updatedAt: "2026-09-30T10:01:00.000Z",
      view: { stage: "synthesizing" },
      subQuestions: ["Q1", "Q2"],
      findings: readyForOutline().findings,
      gaps: [],
      deepening: [],
      attempts: { synthesize: 1 },
    };
    const id = await seedState(repositories, v2);
    const ai = createAI();
    await expect(
      runResearchStage({ context, repositories, reportId: id, ai })
    ).resolves.toMatchObject({ stage: { kind: "outline" }, next: { kind: "write", index: 0 } });
    expect(ai.generateText).not.toHaveBeenCalled();
    const stored = JSON.parse(reports.get(id)!.progress!) as ResearchRunState;
    expect(stored.version).toBe(3);
    expect(stored.outline?.sections).toHaveLength(2);
    expect(stored.sections).toEqual([null, null]);
    // The earlier synthesis attempt does not count against the outline.
    expect(stored.attempts).toEqual({ synthesize: 1 });
  });

  it("resumes mid-write at the first unwritten section without repeating earlier stages", async () => {
    const { repositories, reports } = createRepositories();
    const outline = {
      shape: "explainer" as const,
      tldr: "T [1].",
      takeaways: ["K [2]."],
      sections: [
        { heading: "One", purpose: "p", findings: [0], sourceIds: [1], format: "prose" as const },
        { heading: "Two", purpose: "p", findings: [1], sourceIds: [2], format: "bullets" as const },
        {
          heading: "Three",
          purpose: "p",
          findings: [0, 1],
          sourceIds: [],
          format: "steps" as const,
        },
      ],
      caveats: [],
    };
    const id = await seedState(
      repositories,
      readyForOutline({
        outline,
        sections: [body("Section one [1]."), null, null],
        view: { stage: "writing", current: 2, total: 3, heading: "Two" },
      })
    );
    const ai = createAI();
    // The message that wrote section 0 is delivered again: section 1 runs.
    await expect(runResearchStage({ context, repositories, reportId: id, ai })).resolves.toEqual({
      outcome: "ran",
      stage: { kind: "write", index: 1 },
      next: { kind: "write", index: 2 },
    });
    expect(ai.generateJSON).not.toHaveBeenCalled();
    expect(ai.generateTextWithSearch).not.toHaveBeenCalled();
    expect(ai.generateText).toHaveBeenCalledTimes(1);
    const prompt = ai.generateText.mock.calls[0]![0];
    expect(prompt).toContain("Heading: Two");
    expect(prompt).toContain("2. Two  ← this section");
    expect(prompt).toContain("bold lead-in");
    expect(prompt).toContain("Q2 fact one");
    expect(prompt).not.toContain("Q1 fact one");
    const state = parseResearchRunState(reports.get(id)?.progress, "");
    expect(state.sections[0]).toBe(body("Section one [1]."));
    expect(state.sections[1]).toBe(body("About Two [1]."));
    expect(state.sections[2]).toBeNull();
    expect(state.view).toEqual({ stage: "writing", current: 3, total: 3, heading: "Three" });

    await runResearchStage({ context, repositories, reportId: id, ai });
    expect(reports.get(id)!.status).toBe("completed");
    expect(reports.get(id)!.report).toContain("## Three\n\n");
  });

  it("retries an invalid outline, then falls back to a deterministic outline", async () => {
    const { repositories, reports } = createRepositories();
    const id = await seedState(repositories, readyForOutline());
    const ai = createAI({
      generateJSON: jest
        .fn()
        .mockResolvedValueOnce({ shape: "explainer", tldr: "", sections: [] })
        .mockRejectedValueOnce(new Error("invalid_output")),
    });
    await expect(
      runResearchStage({ context, repositories, reportId: id, ai })
    ).rejects.toBeInstanceOf(ResearchStageRetryError);
    expect(parseResearchRunState(reports.get(id)?.progress, "").attempts).toEqual({ outline: 1 });

    await expect(
      runResearchStage({ context, repositories, reportId: id, ai })
    ).resolves.toMatchObject({ stage: { kind: "outline" }, next: { kind: "write", index: 0 } });
    const state = parseResearchRunState(reports.get(id)?.progress, "");
    expect(state.outline).toEqual({
      shape: "other",
      fallback: true,
      tldr: "Q1 fact two here [1]. Q2 fact one is here [2].",
      takeaways: ["Q1 fact two here [1].", "Q2 fact one is here [2]."],
      sections: [
        {
          heading: "Q1",
          purpose: "Answer the research question: Q1",
          findings: [0],
          sourceIds: [1],
          format: "prose",
        },
        {
          heading: "Q2",
          purpose: "Answer the research question: Q2",
          findings: [1],
          sourceIds: [2],
          format: "prose",
        },
      ],
      caveats: [expect.stringContaining("could not be planned automatically")],
    });
    expect(state.view).toEqual({ stage: "writing", current: 1, total: 2, heading: "Q1" });
  });

  it("writes a placeholder for a section that exhausts its attempts and still completes", async () => {
    const { repositories, reports } = createRepositories();
    const id = await seedState(
      repositories,
      readyForOutline({
        outline: {
          shape: "explainer",
          tldr: "T [2].",
          takeaways: ["K [2]."],
          sections: [
            { heading: "One", purpose: "p", findings: [0], sourceIds: [], format: "prose" },
            { heading: "Two", purpose: "p", findings: [1], sourceIds: [2], format: "prose" },
          ],
          caveats: ["C."],
        },
        sections: [null, body("Section two [2].")],
      })
    );
    const ai = createAI({
      generateText: jest.fn().mockRejectedValue(new Error("Request aborted")),
    });
    for (let attempt = 1; attempt < MAX_STAGE_ATTEMPTS; attempt++) {
      await expect(
        runResearchStage({ context, repositories, reportId: id, ai })
      ).rejects.toBeInstanceOf(ResearchStageRetryError);
      expect(reports.get(id)!.status).toBe("running");
    }
    await expect(runResearchStage({ context, repositories, reportId: id, ai })).resolves.toEqual({
      outcome: "ran",
      stage: { kind: "write", index: 0 },
      next: null,
    });
    const report = reports.get(id)!;
    expect(report.status).toBe("completed");
    // The placeholder cites the section's findings' sources, so they survive renumbering.
    expect(report.report).toContain(
      "## One\n\n*This section could not be written; see sources [2].*\n\n## Two"
    );
    expect(JSON.parse(report.sources).map((source: ResearchSource) => source.url)).toEqual([
      "https://b.example/2",
      "https://a.example/1",
    ]);
  });

  it("retries a section answer that is cut off or too short", async () => {
    const { repositories, reports } = createRepositories();
    const id = await seedState(
      repositories,
      readyForOutline({
        outline: {
          shape: "explainer",
          tldr: "T.",
          takeaways: ["K."],
          sections: [
            { heading: "One", purpose: "p", findings: [0], sourceIds: [1], format: "prose" },
            { heading: "Two", purpose: "p", findings: [1], sourceIds: [2], format: "prose" },
          ],
          caveats: [],
        },
        sections: [null, null],
      })
    );
    const ai = createAI({
      generateText: jest
        .fn()
        .mockResolvedValueOnce("## One\n\nOnly a few words [1].")
        .mockResolvedValueOnce(`## One\n\n${body("Now long enough [1].")}`),
    });
    await expect(
      runResearchStage({ context, repositories, reportId: id, ai })
    ).rejects.toBeInstanceOf(ResearchStageRetryError);
    expect(parseResearchRunState(reports.get(id)?.progress, "").sections).toEqual([null, null]);
    await runResearchStage({ context, repositories, reportId: id, ai });
    expect(parseResearchRunState(reports.get(id)?.progress, "").sections[0]).toBe(
      body("Now long enough [1].")
    );
  });

  it("assembles a stored state whose sections are all written without a model call", async () => {
    const { repositories, reports } = createRepositories();
    const id = await seedState(
      repositories,
      readyForOutline({
        outline: {
          shape: "explainer",
          tldr: "T [1].",
          takeaways: ["K."],
          sections: [
            { heading: "One", purpose: "p", findings: [0], sourceIds: [1], format: "prose" },
          ],
          caveats: [],
        },
        sections: [body("Done [1].")],
      })
    );
    const ai = createAI();
    await expect(runResearchStage({ context, repositories, reportId: id, ai })).resolves.toEqual({
      outcome: "ran",
      stage: { kind: "write", index: 1 },
      next: null,
    });
    expect(ai.generateText).not.toHaveBeenCalled();
    expect(reports.get(id)!.status).toBe("completed");
  });

  it("finishes an in-flight six-section outline from before the cap within 2,500 words", async () => {
    const { repositories, reports } = createRepositories();
    const headings = ["One", "Two", "Three", "Four", "Five", "Six"];
    const outline = {
      shape: "landscape" as const,
      tldr: "T [1].",
      takeaways: ["K [2]."],
      sections: headings.map((heading, index) => ({
        heading,
        purpose: "p",
        findings: [index % 2],
        sourceIds: [(index % 2) + 1],
        format: "prose" as const,
      })),
      caveats: ["C."],
    };
    // Five sections written at the top of the old 250-450 range and beyond (~550 words each).
    const long = (lead: string) =>
      Array.from({ length: 5 }, (_, block) => body(`${lead} paragraph ${block} [1].`, 105)).join(
        "\n\n"
      );
    const id = await seedState(
      repositories,
      readyForOutline({
        outline,
        sections: [...headings.slice(0, 5).map((heading) => long(heading)), null],
        view: { stage: "writing", current: 6, total: 6, heading: "Six" },
      })
    );
    const ai = createAI();
    await expect(runResearchStage({ context, repositories, reportId: id, ai })).resolves.toEqual({
      outcome: "ran",
      stage: { kind: "write", index: 5 },
      next: null,
    });
    expect(ai.generateText).toHaveBeenCalledTimes(1);
    const prompt = ai.generateText.mock.calls[0]![0];
    expect(prompt).toContain("Heading: Six");
    const { max } = sectionWordBudget(outline);
    expect(max).toBeLessThan(MAX_SECTION_WORDS);
    expect(prompt).toContain(`never more than ${max}`);

    const record = reports.get(id)!;
    expect(record.status).toBe("completed");
    expect(countSectionWords(record.report)).toBeLessThanOrEqual(MAX_REPORT_WORDS);
    for (const heading of headings) expect(record.report).toContain(`## ${heading}\n\n`);
    expect(record.report).toContain("About Six");
    expect(JSON.parse(record.sources).length).toBeGreaterThan(0);
  });

  it("acknowledges a report that is not visible to the tenant", async () => {
    const { repositories } = createRepositories();
    const ai = createAI();
    await expect(runResearchStage({ context, repositories, reportId, ai })).resolves.toEqual({
      outcome: "skipped",
      reason: "missing",
    });
    expect(ai.generateText).not.toHaveBeenCalled();
  });

  describe("stage deadline (Production run 8bb4d982 hit the 60 s function limit)", () => {
    const oneSection = {
      shape: "explainer" as const,
      tldr: "T [1].",
      takeaways: ["K [1]."],
      sections: [
        { heading: "One", purpose: "p", findings: [0], sourceIds: [1], format: "prose" as const },
      ],
      caveats: [],
    };

    async function seedWriting(attempts: Record<string, number> = {}) {
      const created = createRepositories();
      const id = await seedState(
        created.repositories,
        readyForOutline({ outline: oneSection, sections: [null], attempts })
      );
      return { ...created, id };
    }

    afterEach(() => {
      jest.useRealTimers();
    });

    it("returns at the deadline when the provider never answers, aborting the request", async () => {
      jest.useFakeTimers();
      const { repositories, reports, id } = await seedWriting();
      let seenSignal: AbortSignal | undefined;
      const ai = createAI({
        generateText: jest.fn(
          (_prompt: string, _task: string, options?: { signal?: AbortSignal }) => {
            seenSignal = options?.signal;
            return new Promise<string>(() => {}); // never settles, ignores the signal
          }
        ),
      });

      const outcome = runResearchStage({ context, repositories, reportId: id, ai }).catch(
        (error: unknown) => error
      );
      await jest.advanceTimersByTimeAsync(RESEARCH_STAGE_DEADLINE_MS - 1);
      expect(seenSignal?.aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(1);

      const error = await outcome;
      expect(error).toBeInstanceOf(ResearchStageRetryError);
      expect((error as Error).cause).toBeInstanceOf(ResearchStageTimeoutError);
      expect(seenSignal?.aborted).toBe(true);
      expect(reports.get(id)!.status).toBe("running");
      expect(parseResearchRunState(reports.get(id)?.progress, "").attempts).toEqual({
        "write:0": 1,
      });
    });

    it("does not store a section that arrives after the deadline", async () => {
      const { repositories, reports, id } = await seedWriting();
      let answer: (text: string) => void = () => {};
      const ai = createAI({
        generateText: jest.fn(() => new Promise<string>((resolve) => (answer = resolve))),
      });
      await expect(
        runResearchStage({ context, repositories, reportId: id, ai, deadlineMs: 5 })
      ).rejects.toBeInstanceOf(ResearchStageRetryError);
      answer(body("Late [1]."));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(reports.get(id)!.status).toBe("running");
      expect(parseResearchRunState(reports.get(id)?.progress, "").sections).toEqual([null]);
    });

    it("fails the report when the only section's last attempt hits the deadline", async () => {
      const { repositories, reports, id } = await seedWriting({
        "write:0": MAX_STAGE_ATTEMPTS - 1,
      });
      const ai = createAI({ generateText: jest.fn(() => new Promise<string>(() => {})) });
      await expect(
        runResearchStage({ context, repositories, reportId: id, ai, deadlineMs: 5 })
      ).resolves.toEqual({ outcome: "ran", stage: { kind: "write", index: 0 }, next: null });
      const report = reports.get(id)!;
      expect(report.status).toBe("failed");
      expect(report.report).toBe(
        "Research failed: none of the report's sections could be written. Please try again."
      );
      expect(report.progress).toBeNull();
    });

    it("counts a delivery the platform killed before it could record its failure", async () => {
      const { repositories, reports, id } = await seedWriting();
      const hung = createAI({ generateText: jest.fn(() => new Promise<string>(() => {})) });
      // The attempt is written before the model call; a killed function never gets further.
      const delivery = runResearchStage({
        context,
        repositories,
        reportId: id,
        ai: hung,
        deadlineMs: 50,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(hung.generateText).toHaveBeenCalledTimes(1);
      expect(parseResearchRunState(reports.get(id)?.progress, "").attempts).toEqual({
        "write:0": 1,
      });
      await expect(delivery).rejects.toBeInstanceOf(ResearchStageRetryError);
    });

    it("gives up on the section without a model call once every write delivery was killed", async () => {
      const { repositories, reports, id } = await seedWriting({ "write:0": MAX_STAGE_ATTEMPTS });
      const ai = createAI();
      await expect(runResearchStage({ context, repositories, reportId: id, ai })).resolves.toEqual({
        outcome: "ran",
        stage: { kind: "write", index: 0 },
        next: null,
      });
      expect(ai.generateText).not.toHaveBeenCalled();
      // The only section is a placeholder, so the report fails rather than completing empty.
      expect(reports.get(id)!.status).toBe("failed");
    });

    it("says the AI budget ran out when every section write was refused by it", async () => {
      const { repositories, reports, id } = await seedWriting();
      const ai = createAI({
        generateText: jest
          .fn()
          .mockRejectedValue(
            Object.assign(new Error("The daily AI budget is exhausted"), { code: "AI_BUDGET" })
          ),
      });
      for (let attempt = 1; attempt < MAX_STAGE_ATTEMPTS; attempt++) {
        await expect(
          runResearchStage({ context, repositories, reportId: id, ai })
        ).rejects.toBeInstanceOf(ResearchStageRetryError);
      }
      await runResearchStage({ context, repositories, reportId: id, ai });
      const report = reports.get(id)!;
      expect(report.status).toBe("failed");
      expect(report.report).toBe(
        "Research failed: the daily AI budget ran out before the report could be written. Please try again later."
      );
      expect(report.sources).not.toContain("http");
    });

    it("falls back to the deterministic outline once every outline delivery was killed", async () => {
      const { repositories, reports } = createRepositories();
      const id = await seedState(
        repositories,
        readyForOutline({ attempts: { outline: MAX_STAGE_ATTEMPTS } })
      );
      const ai = createAI();
      await expect(
        runResearchStage({ context, repositories, reportId: id, ai })
      ).resolves.toMatchObject({ stage: { kind: "outline" }, next: { kind: "write", index: 0 } });
      expect(ai.generateJSON).not.toHaveBeenCalled();
      expect(parseResearchRunState(reports.get(id)?.progress, "").outline).toMatchObject({
        fallback: true,
        sections: [{ heading: "Q1" }, { heading: "Q2" }],
      });
    });

    it("degrades a search stage whose deliveries were all killed and moves on", async () => {
      const { repositories, reports } = createRepositories();
      const { id } = await seedReport(repositories);
      await repositories.research.updateReport(id, {
        status: "running",
        progress: JSON.stringify({
          version: 2,
          updatedAt: "2026-09-30T10:01:00.000Z",
          view: { stage: "researching", current: 0, total: 1, question: "Q1" },
          subQuestions: ["Q1"],
          findings: [null],
          deepening: [],
          attempts: { "search:0": MAX_STAGE_ATTEMPTS },
        } satisfies ResearchRunStateV2),
      });
      const ai = createAI();
      await expect(
        runResearchStage({ context, repositories, reportId: id, ai })
      ).resolves.toMatchObject({ stage: { kind: "search", index: 0 }, next: { kind: "gaps" } });
      expect(ai.generateTextWithSearch).not.toHaveBeenCalled();
      expect(parseResearchRunState(reports.get(id)?.progress, "").findings[0]).toEqual(
        finding("Q1", "(Research on this question failed.)")
      );
    });
  });
});

describe("progress projection and stale guard", () => {
  it("exposes only the stage view, never partial findings", () => {
    const state: ResearchRunState = {
      version: 3,
      updatedAt: "2026-09-21T10:01:00.000Z",
      view: { stage: "researching", current: 1, total: 2, question: "Q1" },
      subQuestions: ["Q1", "Q2"],
      findings: [finding("Q1", "secret partial findings"), null],
      deepening: [],
      sections: ["secret section draft"],
      attempts: {},
    };
    expect(publicResearchProgress(JSON.stringify(state))).toEqual(state.view);
    expect(JSON.stringify(publicResearchProgress(JSON.stringify(state)))).not.toContain("secret");
    expect(publicResearchProgress(JSON.stringify({ stage: "planning" }))).toEqual({
      stage: "planning",
    });
    expect(publicResearchProgress("not json")).toBeNull();
    expect(publicResearchProgress(null)).toBeNull();
  });

  it("orders stages from durable state", () => {
    const base: ResearchRunState = {
      version: 3,
      updatedAt: "",
      view: { stage: "planning" },
      findings: [],
      deepening: [],
      sections: [],
      attempts: {},
    };
    expect(nextResearchStage(base)).toEqual({ kind: "plan" });
    expect(nextResearchStage({ ...base, subQuestions: ["a"], findings: [null] })).toEqual({
      kind: "search",
      index: 0,
    });
    expect(nextResearchStage({ ...base, subQuestions: ["a"], findings: [finding("x")] })).toEqual({
      kind: "gaps",
    });
    expect(
      nextResearchStage({
        ...base,
        subQuestions: ["a"],
        findings: [finding("x")],
        gaps: ["g"],
        deepening: [null],
      })
    ).toEqual({ kind: "deepen", index: 0 });
    expect(
      nextResearchStage({
        ...base,
        subQuestions: ["a"],
        findings: [finding("x")],
        gaps: [],
        deepening: [],
      })
    ).toEqual({ kind: "outline" });
    const outline = {
      shape: "other" as const,
      tldr: "t",
      takeaways: ["k"],
      sections: [
        { heading: "A", purpose: "", findings: [0], sourceIds: [], format: "prose" as const },
        { heading: "B", purpose: "", findings: [0], sourceIds: [], format: "prose" as const },
      ],
      caveats: [],
    };
    const outlined = { ...base, subQuestions: ["a"], findings: [finding("x")], gaps: [], outline };
    expect(nextResearchStage({ ...outlined, sections: [null, null] })).toEqual({
      kind: "write",
      index: 0,
    });
    expect(nextResearchStage({ ...outlined, sections: ["done", null] })).toEqual({
      kind: "write",
      index: 1,
    });
    // All written (never stored in practice): a write past the last section only assembles.
    expect(nextResearchStage({ ...outlined, sections: ["done", "done"] })).toEqual({
      kind: "write",
      index: 2,
    });
  });

  it("measures staleness from the last stage write, not the report creation", async () => {
    const now = Date.parse("2026-09-21T10:30:00.000Z");
    const createdAt = new Date(now - 2 * STALE_RESEARCH_MS).toISOString();
    const updateReport = jest.fn();
    const repositories = { research: { updateReport } } as unknown as RepositorySet;
    const state: ResearchRunState = {
      version: 3,
      updatedAt: new Date(now - STALE_RESEARCH_MS + 60_000).toISOString(),
      view: { stage: "writing", current: 1, total: 3, heading: "h" },
      subQuestions: ["a"],
      findings: [finding("x")],
      gaps: [],
      deepening: [],
      sections: [null, null, null],
      attempts: {},
    };
    const report = { id: "r1", status: "running", createdAt, progress: JSON.stringify(state) };
    await expect(failStaleReport(repositories, report, now)).resolves.toBe(report);
    expect(updateReport).not.toHaveBeenCalled();

    const idle = { ...report, progress: JSON.stringify({ ...state, updatedAt: createdAt }) };
    updateReport.mockResolvedValue({ ...idle, status: "failed" });
    await expect(failStaleReport(repositories, idle, now)).resolves.toMatchObject({
      status: "failed",
    });
    expect(updateReport).toHaveBeenCalledWith("r1", expect.objectContaining({ status: "failed" }));
  });
});

describe("outline and write budget", () => {
  it("caps output per provider and keeps every stage inside the lease", () => {
    expect(RESEARCH_OUTLINE_OPTIONS).toEqual({
      timeoutMs: 40_000,
      maxTokens: 2_500,
      rejectTruncated: true,
      providerOverrides: { gemini: { maxTokens: 6_000, thinking: "low" } },
    });
    expect(RESEARCH_WRITE_OPTIONS).toEqual({
      timeoutMs: 40_000,
      maxTokens: 2_000,
      rejectTruncated: true,
      providerOverrides: { gemini: { maxTokens: 5_000, thinking: "low" } },
    });
    // Provider timeouts sit inside the one stage deadline, which leaves the lease room for the
    // attempt write before, the state write after and the next publish.
    expect(RESEARCH_TIMEOUTS_MS.outline).toBeLessThan(RESEARCH_STAGE_DEADLINE_MS);
    expect(RESEARCH_TIMEOUTS_MS.write).toBeLessThan(RESEARCH_STAGE_DEADLINE_MS);
    expect(RESEARCH_STAGE_DEADLINE_MS).toBeLessThanOrEqual(45_000);
  });

  it("aborts the signal and rejects at the deadline even when the work ignores it", async () => {
    jest.useFakeTimers();
    try {
      let seen: AbortSignal | undefined;
      const pending = withStageDeadline("write:0", 42_000, (signal) => {
        seen = signal;
        return new Promise<string>(() => undefined);
      });
      const settled = expect(pending).rejects.toBeInstanceOf(ResearchStageTimeoutError);
      jest.advanceTimersByTime(42_000);
      await settled;
      expect(seen?.aborted).toBe(true);
      await expect(withStageDeadline("write:0", 42_000, async () => "ok")).resolves.toBe("ok");
    } finally {
      jest.useRealTimers();
    }
  });
});
