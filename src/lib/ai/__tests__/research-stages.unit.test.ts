jest.mock("@/lib/queue/research-dispatch", () => ({ resolveResearchDispatcher: jest.fn() }));
jest.mock("../router", () => ({
  createTenantAIRouter: jest.fn(),
  getEffectiveModel: jest.fn(() => ({ provider: "gemini", model: "gemini-test" })),
}));

import {
  failStaleReport,
  MAX_STAGE_ATTEMPTS,
  nextResearchStage,
  parseResearchRunState,
  publicResearchProgress,
  ResearchStageRetryError,
  runResearchStage,
  STALE_RESEARCH_MS,
  startResearch,
  type ResearchAI,
  type ResearchRunState,
} from "../research";
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

function createAI(overrides: Partial<ResearchAI> = {}): jest.Mocked<ResearchAI> {
  return {
    generateText: jest.fn(async (_prompt: string, task: string) => {
      if (task === "research-plan") return JSON.stringify(["Q1", "Q2"]);
      if (task === "research-synthesize") return "# Report";
      return "text";
    }),
    generateJSON: jest.fn(async () => ({ gaps: ["Gap A"] })),
    generateTextWithSearch: jest.fn(
      async (prompt: string) =>
        `findings for ${prompt.split("\n\n")[1]} https://example.com/${encodeURIComponent(prompt.split("\n\n")[1] ?? "")}`
    ),
    ...overrides,
  } as jest.Mocked<ResearchAI>;
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
  it("walks plan → search × n → gaps → deepen × m → synthesize, one stage per call", async () => {
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
      { timeoutMs: 30_000 }
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
    expect(ai.generateTextWithSearch).toHaveBeenLastCalledWith(expect.stringContaining("Q1"), {
      timeoutMs: 45_000,
      maxTokens: 2048,
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
    });
    expect(publicResearchProgress(reports.get(id)?.progress)).toEqual({
      stage: "deepening",
      current: 0,
      total: 1,
      question: "Gap A",
    });

    await expect(run()).resolves.toMatchObject({
      stage: { kind: "deepen", index: 0 },
      next: { kind: "synthesize" },
    });
    expect(ai.generateTextWithSearch).toHaveBeenLastCalledWith(expect.stringContaining("Gap A"), {
      timeoutMs: 45_000,
      maxTokens: 2048,
    });

    await expect(run()).resolves.toEqual({
      outcome: "ran",
      stage: { kind: "synthesize" },
      next: null,
    });
    const synthesizePrompt = ai.generateText.mock.calls.at(-1)?.[0] ?? "";
    expect(synthesizePrompt).toContain("## Q1");
    expect(synthesizePrompt).toContain("## Additional Deepening");
    const final = reports.get(id)!;
    expect(final.status).toBe("completed");
    expect(final.report).toBe("# Report");
    expect(final.progress).toBeNull();
    expect(JSON.parse(final.sources)).toHaveLength(3);
    expect(final.completedAt).toBeDefined();

    // A late duplicate delivery acknowledges without touching the model.
    const calls = ai.generateText.mock.calls.length;
    await expect(run()).resolves.toEqual({ outcome: "skipped", reason: "terminal" });
    expect(ai.generateText).toHaveBeenCalledTimes(calls);
  });

  it("resumes a redelivered message from the first unfinished stage instead of restarting", async () => {
    const { repositories, reports } = createRepositories();
    const { id } = await seedReport(repositories);
    const ai = createAI();
    const partial: ResearchRunState = {
      version: 1,
      updatedAt: "2026-09-21T10:01:00.000Z",
      view: { stage: "researching", current: 1, total: 2, question: "Q1" },
      subQuestions: ["Q1", "Q2"],
      findings: ["## Q1\n\nalready done", null],
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
      expect.stringContaining("Q2"),
      expect.anything()
    );
    const state = parseResearchRunState(reports.get(id)?.progress, "");
    expect(state.findings[0]).toBe("## Q1\n\nalready done");
    expect(state.findings[1]).toContain("Q2");
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
    expect(state.findings[0]).toContain("(Research on this question failed.)");
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
    const { repositories } = createRepositories();
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
      next: { kind: "synthesize" },
    });
  });

  it("marks the report failed when synthesis exhausts its attempts", async () => {
    const { repositories, reports } = createRepositories();
    const { id } = await seedReport(repositories);
    const synthesizing: ResearchRunState = {
      version: 1,
      updatedAt: "2026-09-21T10:01:00.000Z",
      view: { stage: "synthesizing" },
      subQuestions: ["Q1"],
      findings: ["## Q1\n\ndone"],
      gaps: [],
      deepening: [],
      attempts: { synthesize: MAX_STAGE_ATTEMPTS - 1 },
    };
    await repositories.research.updateReport(id, {
      status: "running",
      progress: JSON.stringify(synthesizing),
    });
    const ai = createAI({
      generateText: jest.fn().mockRejectedValue(new Error("Request aborted")),
    });
    await expect(runResearchStage({ context, repositories, reportId: id, ai })).resolves.toEqual({
      outcome: "ran",
      stage: { kind: "synthesize" },
      next: null,
    });
    const report = reports.get(id)!;
    expect(report.status).toBe("failed");
    expect(report.report).toContain("Request aborted");
    expect(report.progress).toBeNull();
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
});

describe("progress projection and stale guard", () => {
  it("exposes only the stage view, never partial findings", () => {
    const state: ResearchRunState = {
      version: 1,
      updatedAt: "2026-09-21T10:01:00.000Z",
      view: { stage: "researching", current: 1, total: 2, question: "Q1" },
      subQuestions: ["Q1", "Q2"],
      findings: ["secret partial findings", null],
      deepening: [],
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
      version: 1,
      updatedAt: "",
      view: { stage: "planning" },
      findings: [],
      deepening: [],
      attempts: {},
    };
    expect(nextResearchStage(base)).toEqual({ kind: "plan" });
    expect(nextResearchStage({ ...base, subQuestions: ["a"], findings: [null] })).toEqual({
      kind: "search",
      index: 0,
    });
    expect(nextResearchStage({ ...base, subQuestions: ["a"], findings: ["x"] })).toEqual({
      kind: "gaps",
    });
    expect(
      nextResearchStage({
        ...base,
        subQuestions: ["a"],
        findings: ["x"],
        gaps: ["g"],
        deepening: [null],
      })
    ).toEqual({ kind: "deepen", index: 0 });
    expect(
      nextResearchStage({ ...base, subQuestions: ["a"], findings: ["x"], gaps: [], deepening: [] })
    ).toEqual({
      kind: "synthesize",
    });
  });

  it("measures staleness from the last stage write, not the report creation", async () => {
    const now = Date.parse("2026-09-21T10:30:00.000Z");
    const createdAt = new Date(now - 2 * STALE_RESEARCH_MS).toISOString();
    const updateReport = jest.fn();
    const repositories = { research: { updateReport } } as unknown as RepositorySet;
    const state: ResearchRunState = {
      version: 1,
      updatedAt: new Date(now - STALE_RESEARCH_MS + 60_000).toISOString(),
      view: { stage: "synthesizing" },
      subQuestions: ["a"],
      findings: ["x"],
      gaps: [],
      deepening: [],
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
