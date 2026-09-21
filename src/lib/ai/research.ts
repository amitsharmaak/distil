/**
 * Deep research module.
 *
 * A run is a chain of resumable stages, one queue message each:
 * plan → search (one per sub-question) → gaps → deepen (one per gap) →
 * synthesize. Stage state and partial findings live in
 * `research_reports.progress` as JSON, so a killed or redelivered message
 * resumes at the first unfinished stage instead of restarting. Every stage is
 * sized to finish well inside a 60 s Vercel Hobby invocation.
 *
 * `startResearch` creates the report row and publishes the first stage; the
 * `research-runs` queue consumer (`src/lib/queue/research-consumer.ts`) runs
 * `runResearchStage` and publishes the next one.
 *
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import crypto from "crypto";
import { aiLogger, sanitizeLogError } from "@/lib/logger";
import { createTenantAIRouter, getEffectiveModel } from "./router";
import {
  researchPlanPrompt,
  researchSynthesizePrompt,
  researchGapsPrompt,
} from "@/lib/prompts/research";
import type { AuthContext } from "@/lib/contracts/tenant-context";
import {
  createResearchRunMessageV1,
  researchRunIdempotencyKey,
  type ResearchRunStepKind,
} from "@/lib/contracts/tenant-jobs";
import type { RepositorySet, ResearchReportRecord } from "@/lib/repositories/ports";
import { resolveResearchDispatcher } from "@/lib/queue/research-dispatch";
import type { ResearchDispatcher } from "@/lib/queue/dispatchers";

/**
 * Per-call provider timeouts. The provider default (15 s) is sized for
 * summaries; grounded searches and the final synthesis produce far longer
 * outputs. Each stage runs inside one 60 s queue invocation (the callback
 * lease), so synthesis is capped at 50 s to leave room for the report reads
 * and writes around the model call.
 */
export const RESEARCH_TIMEOUTS_MS = {
  plan: 30_000,
  search: 45_000,
  gaps: 30_000,
  synthesize: 50_000,
} as const;

/**
 * Output budget for one search or deepening answer. The provider default
 * (4096 tokens) let a flash model overrun the 45 s search timeout on the
 * local loop; findings for one sub-question fit comfortably in half that.
 */
export const RESEARCH_SEARCH_MAX_TOKENS = 2048;

/** Bound on the sub-questions a plan may produce; the prompt asks for 3–5. */
export const MAX_SUB_QUESTIONS = 5;
/** Bound on deepening questions taken from the gaps stage. */
export const MAX_GAPS = 2;
/** Deliveries a stage may fail before its degraded outcome is recorded. */
export const MAX_STAGE_ATTEMPTS = 2;

/** Progress payload the UI reads (stage stepper on `/research/[id]`). */
export type ResearchProgressView =
  | { stage: "planning" }
  | { stage: "researching"; current: number; total: number; question: string }
  | { stage: "deepening"; current: number; total: number; question: string }
  | { stage: "synthesizing" };

/** One resumable stage of a run. */
export interface ResearchStage {
  kind: ResearchRunStepKind;
  index?: number;
}

/**
 * Durable run state stored in `research_reports.progress`. `findings` and
 * `deepening` hold one slot per question; `null` marks a slot still to do.
 * `gaps` is absent until the gaps stage has run.
 */
export interface ResearchRunState {
  version: 1;
  updatedAt: string;
  view: ResearchProgressView;
  subQuestions?: string[];
  findings: Array<string | null>;
  gaps?: string[];
  deepening: Array<string | null>;
  attempts: Record<string, number>;
}

export type ResearchAI = Pick<
  ReturnType<typeof createTenantAIRouter>,
  "generateText" | "generateJSON" | "generateTextWithSearch"
>;

/** Thrown when a stage failed but may be redelivered; the queue retries the message. */
export class ResearchStageRetryError extends Error {
  constructor(
    readonly stageKey: string,
    readonly attempt: number,
    cause: unknown
  ) {
    super(`research stage ${stageKey} failed on attempt ${attempt}`, { cause });
    this.name = "ResearchStageRetryError";
  }
}

export function stageKey(stage: ResearchStage): string {
  return stage.index === undefined ? stage.kind : `${stage.kind}:${stage.index}`;
}

function initialState(now: string): ResearchRunState {
  return {
    version: 1,
    updatedAt: now,
    view: { stage: "planning" },
    findings: [],
    deepening: [],
    attempts: {},
  };
}

function isRunState(value: unknown): value is ResearchRunState {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { version?: unknown }).version === 1 &&
    Array.isArray((value as { findings?: unknown }).findings) &&
    Array.isArray((value as { deepening?: unknown }).deepening)
  );
}

/** Reads the durable state; a missing or legacy flat payload starts fresh. */
export function parseResearchRunState(
  progress: string | null | undefined,
  now: string
): ResearchRunState {
  if (!progress) return initialState(now);
  try {
    const parsed: unknown = JSON.parse(progress);
    if (isRunState(parsed)) return parsed;
  } catch {
    // fall through to a fresh state
  }
  return initialState(now);
}

/**
 * The stage view exposed to clients. Read routes and the SSE stream send only
 * this projection; partial findings stay in the database.
 */
export function publicResearchProgress(
  progress: string | null | undefined
): ResearchProgressView | null {
  if (!progress) return null;
  try {
    const parsed: unknown = JSON.parse(progress);
    if (isRunState(parsed)) return parsed.view;
    if (typeof parsed === "object" && parsed !== null && "stage" in parsed) {
      return parsed as ResearchProgressView;
    }
  } catch {
    // ignore malformed progress
  }
  return null;
}

export function publicResearchProgressString(progress: string | null | undefined): string | null {
  const view = publicResearchProgress(progress);
  return view ? JSON.stringify(view) : null;
}

/** First unfinished stage, or `null` once synthesis has completed. */
export function nextResearchStage(state: ResearchRunState): ResearchStage | null {
  if (!state.subQuestions) return { kind: "plan" };
  const pending = state.findings.findIndex((finding) => finding === null);
  if (pending >= 0) return { kind: "search", index: pending };
  if (!state.gaps) return { kind: "gaps" };
  const pendingGap = state.deepening.findIndex((finding) => finding === null);
  if (pendingGap >= 0) return { kind: "deepen", index: pendingGap };
  return { kind: "synthesize" };
}

/**
 * Start a deep research task: create the report row and publish the plan
 * stage. Returns the report id immediately; the run proceeds on the queue.
 */
export async function startResearch(
  authContext: AuthContext,
  repositories: RepositorySet,
  query: string,
  itemId?: string,
  dispatcher?: ResearchDispatcher
): Promise<string> {
  const reportId = crypto.randomUUID();
  const { model } = getEffectiveModel("research-plan");
  await repositories.research.insertReport({
    id: reportId,
    itemId,
    query,
    model,
  });
  await setState(repositories, reportId, initialState(new Date().toISOString()));

  try {
    await dispatchResearchStage(
      dispatcher ?? (await resolveResearchDispatcher()),
      authContext,
      reportId,
      { kind: "plan" }
    );
  } catch (error) {
    aiLogger.error(
      { event: "research_dispatch_failed", jobId: reportId, err: sanitizeLogError(error) },
      "Research dispatch failed"
    );
    await repositories.research.updateReport(reportId, {
      status: "failed",
      report: "Research could not be started. Please try again.",
      completedAt: new Date().toISOString(),
      progress: null,
    });
    throw error;
  }

  return reportId;
}

export async function dispatchResearchStage(
  dispatcher: ResearchDispatcher,
  authContext: AuthContext,
  reportId: string,
  stage: ResearchStage
): Promise<void> {
  const message = createResearchRunMessageV1({
    userId: authContext.userId,
    reportId,
    traceId: authContext.requestId,
    step: stage.kind,
    index: stage.index,
  });
  await dispatcher.dispatch(message, { idempotencyKey: researchRunIdempotencyKey(message) });
}

/** A run with no progress write for this long is treated as lost. */
export const STALE_RESEARCH_MS = 15 * 60 * 1000;

function isTerminal(status: string): boolean {
  return status === "completed" || status === "failed";
}

/**
 * Marks a report that never reached a terminal state as failed once no stage
 * has written progress for {@link STALE_RESEARCH_MS} (falling back to the
 * report's creation time when no stage ran). Returns the (possibly updated)
 * record so read routes never hand the UI a spinner that can never resolve.
 */
export async function failStaleReport<
  T extends { status: string; createdAt: string; id: string; progress?: string | null },
>(repositories: RepositorySet, report: T, now: number = Date.now()): Promise<T> {
  if (isTerminal(report.status)) return report;
  const lastActivity = lastResearchActivity(report);
  if (Number.isNaN(lastActivity) || now - lastActivity < STALE_RESEARCH_MS) return report;
  const failedAt = new Date(now).toISOString();
  const updated = await repositories.research.updateReport(report.id, {
    status: "failed",
    report: "Research timed out before it could finish. Please try again.",
    completedAt: failedAt,
    progress: null,
  });
  return (updated as T | undefined) ?? { ...report, status: "failed", completedAt: failedAt };
}

function lastResearchActivity(report: { createdAt: string; progress?: string | null }): number {
  const createdAt = Date.parse(report.createdAt);
  if (!report.progress) return createdAt;
  try {
    const parsed: unknown = JSON.parse(report.progress);
    if (isRunState(parsed)) {
      const updatedAt = Date.parse(parsed.updatedAt);
      if (!Number.isNaN(updatedAt)) return Math.max(createdAt, updatedAt);
    }
  } catch {
    // ignore malformed progress
  }
  return createdAt;
}

async function setState(
  repositories: RepositorySet,
  reportId: string,
  state: ResearchRunState,
  patch: { status?: string } = {}
): Promise<void> {
  await repositories.research.updateReport(reportId, {
    ...patch,
    progress: JSON.stringify(state),
  });
}

export interface RunResearchStageInput {
  context: AuthContext;
  repositories: RepositorySet;
  reportId: string;
  /** Injected in tests; defaults to the tenant-bound router. */
  ai?: ResearchAI;
  now?: () => Date;
}

export type RunResearchStageResult =
  | { outcome: "ran"; stage: ResearchStage; next: ResearchStage | null }
  | { outcome: "skipped"; reason: "missing" | "terminal" };

/**
 * Runs the first unfinished stage of a report and persists the result. The
 * caller publishes `next` when it is not `null`. Throws
 * {@link ResearchStageRetryError} when the stage failed and may be retried by
 * redelivering the same message.
 */
export async function runResearchStage(
  input: RunResearchStageInput
): Promise<RunResearchStageResult> {
  const { context, repositories, reportId } = input;
  const now = input.now ?? (() => new Date());
  const report = await repositories.research.findReport(reportId);
  if (!report) return { outcome: "skipped", reason: "missing" };
  if (isTerminal(report.status)) return { outcome: "skipped", reason: "terminal" };

  const state = parseResearchRunState(report.progress, now().toISOString());
  const stage = nextResearchStage(state);
  if (!stage) return { outcome: "skipped", reason: "terminal" };
  const key = stageKey(stage);
  const ai = input.ai ?? createTenantAIRouter(context, repositories);
  if (report.status !== "running") {
    await repositories.research.updateReport(reportId, { status: "running" });
  }

  try {
    await executeStage(ai, repositories, report, state, stage);
  } catch (error) {
    const attempt = (state.attempts[key] ?? 0) + 1;
    state.attempts[key] = attempt;
    aiLogger.warn(
      {
        event: "research_stage_failed",
        jobId: reportId,
        operation: key,
        attempt,
        maxAttempts: MAX_STAGE_ATTEMPTS,
        traceId: context.requestId,
        err: sanitizeLogError(error),
      },
      "Research stage failed"
    );
    if (attempt < MAX_STAGE_ATTEMPTS) {
      state.updatedAt = now().toISOString();
      await setState(repositories, reportId, state, { status: "running" });
      throw new ResearchStageRetryError(key, attempt, error);
    }
    const degraded = applyDegradedOutcome(report, state, stage);
    if (!degraded) {
      await repositories.research.updateReport(reportId, {
        status: "failed",
        report: `Research failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        completedAt: now().toISOString(),
        progress: null,
      });
      return { outcome: "ran", stage, next: null };
    }
  }

  aiLogger.info(
    {
      event: "research_stage_completed",
      jobId: reportId,
      operation: key,
      traceId: context.requestId,
    },
    "Research stage completed"
  );
  if (stage.kind === "synthesize") {
    // The synthesis stage wrote the completed report and cleared progress.
    return { outcome: "ran", stage, next: null };
  }
  state.updatedAt = now().toISOString();
  await setState(repositories, reportId, state);
  return { outcome: "ran", stage, next: nextResearchStage(state) };
}

/**
 * Records the outcome a stage falls back to after its retry budget: a plan
 * becomes the query itself, a failed search or deepening question a
 * placeholder, gaps an empty list. Synthesis has no fallback (returns false).
 */
function applyDegradedOutcome(
  report: ResearchReportRecord,
  state: ResearchRunState,
  stage: ResearchStage
): boolean {
  switch (stage.kind) {
    case "plan":
      setSubQuestions(state, [report.query]);
      return true;
    case "search": {
      const index = stage.index ?? 0;
      const question = state.subQuestions?.[index] ?? report.query;
      state.findings[index] = `## ${question}\n\n(Research on this question failed.)`;
      state.view = researchingView(state, index);
      return true;
    }
    case "gaps":
      setGaps(state, []);
      return true;
    case "deepen": {
      const index = stage.index ?? 0;
      const question = state.gaps?.[index] ?? report.query;
      state.deepening[index] = `## ${question}\n\n(Research on this gap failed.)`;
      state.view = deepeningView(state, index);
      return true;
    }
    case "synthesize":
      return false;
  }
}

function setSubQuestions(state: ResearchRunState, subQuestions: string[]): void {
  state.subQuestions = subQuestions;
  state.findings = subQuestions.map(() => null);
  state.view = {
    stage: "researching",
    current: 0,
    total: subQuestions.length,
    question: subQuestions[0] ?? "",
  };
}

function setGaps(state: ResearchRunState, gaps: string[]): void {
  state.gaps = gaps;
  state.deepening = gaps.map(() => null);
  state.view =
    gaps.length > 0
      ? { stage: "deepening", current: 0, total: gaps.length, question: gaps[0] ?? "" }
      : { stage: "synthesizing" };
}

function researchingView(state: ResearchRunState, completedIndex: number): ResearchProgressView {
  const total = state.subQuestions?.length ?? 0;
  const completed = state.findings.filter((finding) => finding !== null).length;
  return {
    stage: "researching",
    current: completed,
    total,
    question: state.subQuestions?.[completedIndex] ?? "",
  };
}

function deepeningView(state: ResearchRunState, completedIndex: number): ResearchProgressView {
  const total = state.gaps?.length ?? 0;
  const completed = state.deepening.filter((finding) => finding !== null).length;
  return {
    stage: "deepening",
    current: completed,
    total,
    question: state.gaps?.[completedIndex] ?? "",
  };
}

function combinedFindings(state: ResearchRunState): string {
  const first = state.findings.map((finding) => finding ?? "").join("\n\n---\n\n");
  const deepening = state.deepening.filter((finding): finding is string => finding !== null);
  if (deepening.length === 0) return first;
  return `${first}\n\n---\n\n## Additional Deepening\n\n${deepening.join("\n\n---\n\n")}`;
}

async function executeStage(
  ai: ResearchAI,
  repositories: RepositorySet,
  report: ResearchReportRecord,
  state: ResearchRunState,
  stage: ResearchStage
): Promise<void> {
  switch (stage.kind) {
    case "plan": {
      let itemContext: string | undefined;
      if (report.itemId) {
        const item = await repositories.items.findById(report.itemId);
        if (item) {
          itemContext = [item.title, item.summary, item.fullContent].filter(Boolean).join("\n\n");
        }
      }
      const planText = await ai.generateText(
        researchPlanPrompt(report.query, itemContext),
        "research-plan",
        { timeoutMs: RESEARCH_TIMEOUTS_MS.plan }
      );
      setSubQuestions(state, parseSubQuestions(planText, report.query));
      return;
    }
    case "search": {
      const index = stage.index ?? 0;
      const question = state.subQuestions?.[index] ?? report.query;
      const result = await ai.generateTextWithSearch(
        `Research this question thoroughly and provide detailed findings with source URLs:\n\n${question}`,
        { timeoutMs: RESEARCH_TIMEOUTS_MS.search, maxTokens: RESEARCH_SEARCH_MAX_TOKENS }
      );
      state.findings[index] = `## ${question}\n\n${result}`;
      state.view = researchingView(state, index);
      return;
    }
    case "gaps": {
      let gaps: string[] = [];
      try {
        const result = await ai.generateJSON<{ gaps: string[] }>(
          researchGapsPrompt(report.query, combinedFindings(state)),
          "research-gaps",
          { timeoutMs: RESEARCH_TIMEOUTS_MS.gaps }
        );
        gaps = Array.isArray(result?.gaps)
          ? result.gaps.filter((gap): gap is string => typeof gap === "string").slice(0, MAX_GAPS)
          : [];
      } catch (error) {
        // Gaps are optional: a failed gap analysis skips deepening, as before.
        aiLogger.warn(
          { event: "research_gaps_skipped", jobId: report.id, err: sanitizeLogError(error) },
          "Research gap analysis skipped"
        );
      }
      setGaps(state, gaps);
      return;
    }
    case "deepen": {
      const index = stage.index ?? 0;
      const question = state.gaps?.[index] ?? report.query;
      const result = await ai.generateTextWithSearch(
        `Research this specific gap/question concisely with source URLs:\n\n${question}`,
        { timeoutMs: RESEARCH_TIMEOUTS_MS.search, maxTokens: RESEARCH_SEARCH_MAX_TOKENS }
      );
      state.deepening[index] = `## ${question}\n\n${result}`;
      state.view = deepeningView(state, index);
      return;
    }
    case "synthesize": {
      state.view = { stage: "synthesizing" };
      const findings = combinedFindings(state);
      const reportText = await ai.generateText(
        researchSynthesizePrompt(report.query, findings),
        "research-synthesize",
        { timeoutMs: RESEARCH_TIMEOUTS_MS.synthesize }
      );
      const urlRegex = /https?:\/\/[^\s\)>\]"']+/g;
      const sources = [...new Set(findings.match(urlRegex) ?? [])];
      await repositories.research.updateReport(report.id, {
        report: reportText,
        sources: JSON.stringify(sources),
        status: "completed",
        completedAt: new Date().toISOString(),
        progress: null,
      });
      return;
    }
  }
}

function parseSubQuestions(planText: string, query: string): string[] {
  try {
    const parsed: unknown = JSON.parse(planText);
    if (Array.isArray(parsed)) {
      const questions = parsed
        .filter((question): question is string => typeof question === "string")
        .map((question) => question.trim())
        .filter(Boolean)
        .slice(0, MAX_SUB_QUESTIONS);
      if (questions.length > 0) return questions;
    }
  } catch {
    // fall back to the query itself
  }
  return [query];
}
