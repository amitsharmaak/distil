/**
 * Deep research module.
 *
 * A run is a chain of resumable stages, one queue message each:
 * plan → search (one per sub-question) → gaps → deepen (one per gap) →
 * outline → write (one per report section). The last write assembles the
 * report (no model call) and completes it. Stage state and partial findings
 * live in `research_reports.progress` as JSON, so a killed or redelivered
 * message resumes at the first unfinished stage instead of restarting. Every
 * stage is sized to finish well inside a 60 s Vercel Hobby invocation.
 *
 * `startResearch` creates the report row and publishes the first stage; the
 * `research-runs` queue consumer (`src/lib/queue/research-consumer.ts`) runs
 * `runResearchStage` and publishes the next one.
 *
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import crypto from "crypto";
import { aiLogger, sanitizeLogError } from "@/lib/logger";
import { createTenantAIRouter, getEffectiveModel, type SearchTextResult } from "./router";
import {
  researchPlanPrompt,
  researchGapsPrompt,
  researchNotesPrompt,
  researchOutlinePrompt,
  researchSectionPrompt,
} from "@/lib/prompts/research";
import { htmlToReadableText } from "@/lib/format";
import {
  assembleReport,
  cleanSectionBody,
  countSectionWords,
  fallbackOutline,
  isSectionPlaceholder,
  isUsableFinding,
  OUTLINE_RESPONSE_SCHEMA,
  parseOutline,
  sectionPlaceholder,
  type ResearchOutline,
} from "./research-report";
import {
  buildSourceCatalog,
  extractRecalledSources,
  finalizeCitations,
  formatSourceList,
  isGroundingRedirect,
  MAX_GROUNDING_RESOLUTIONS,
  resolveGroundingRedirects,
  scrapeUrlSources,
  type FindingSource,
  type SourceCatalog,
} from "./research-sources";
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
 * summaries; grounded searches and report writing produce far longer
 * outputs. Each stage runs inside one 60 s queue invocation (the callback
 * lease). A grounded search stage may add up to
 * `GROUNDING_RESOLVE_TIMEOUT_MS` (3 s) to resolve Google redirect links.
 *
 * Outline and write budget (R3): the model call gets 40 s and one provider
 * attempt (`maxAttempts: 1`, so the Anthropic SDK does not retry a timed-out
 * request inside the same invocation); {@link RESEARCH_STAGE_DEADLINE_MS}
 * stops waiting at 42 s even if an SDK fails to abort. Around the call the
 * stage reads the report, may mark it running and writes the state (or the
 * assembled report) and the consumer publishes the next message: well under
 * 3 s together, so a stage ends by ~45 s, 15 s inside the lease. The stage
 * machinery retries by redelivery.
 */
export const RESEARCH_TIMEOUTS_MS = {
  plan: 30_000,
  search: 45_000,
  gaps: 30_000,
  outline: 40_000,
  write: 40_000,
} as const;

/** Hard stop for an outline or write model call, whatever the provider SDK does. */
export const RESEARCH_STAGE_DEADLINE_MS = 42_000;

/**
 * Output budget for one search or deepening answer. The provider default
 * (4096 tokens) let a flash model overrun the 45 s search timeout on the
 * local loop; findings for one sub-question fit comfortably in half that.
 */
export const RESEARCH_SEARCH_MAX_TOKENS = 2048;

/**
 * Output budgets for the outline (JSON, ~1k answer tokens) and one section (250-450 words,
 * ~600-700 answer tokens), per provider, sized so the budget itself cannot outrun the 40 s
 * timeout by much.
 * - Anthropic (Production, `claude-sonnet-4-6`, no extended thinking, ~60-80 output tokens/s):
 *   2,500 / 2,000 tokens ≈ 31-42 s / 25-33 s at the cap; a real outline or section is well below.
 * - Gemini (`gemini-3.5-flash` without the Anthropic key): thinking counts against the same
 *   budget. On the provider default (4096) the old single synthesis spent ~3,900 tokens thinking
 *   and returned only the cut-off tail of its reasoning (local run `79e2f8cc`); these calls ask
 *   for low thinking and keep headroom for it. Probe (2026-09-30, synthetic fixture, low
 *   thinking): outline 845 answer tokens, no thinking reported, 5.0 s; a 359-word table section
 *   574 answer + 1,712 thinking tokens, 10.0 s (~230 tokens/s, so 5,000 tokens ≈ 22 s).
 * `rejectTruncated` turns a cut-off answer into a retry either way.
 */
export const RESEARCH_REPORT_MAX_TOKENS = {
  anthropic: { outline: 2_500, write: 2_000 },
  gemini: { outline: 6_000, write: 5_000 },
} as const;

/** The outline or write output budget for the provider `research-synthesize` routes to. */
export function researchReportMaxTokens(kind: "outline" | "write"): number {
  const { provider } = getEffectiveModel("research-synthesize");
  return provider === "anthropic"
    ? RESEARCH_REPORT_MAX_TOKENS.anthropic[kind]
    : RESEARCH_REPORT_MAX_TOKENS.gemini[kind];
}

/** Thrown when an outline or write call is still running at {@link RESEARCH_STAGE_DEADLINE_MS}. */
export class ResearchDeadlineError extends Error {
  constructor(readonly kind: string) {
    super(`research ${kind} call exceeded the stage deadline`);
    this.name = "ResearchDeadlineError";
  }
}

/**
 * Resolves with the call, or rejects at the deadline so the stage records a failed attempt and
 * returns inside the lease even if the provider SDK has not aborted its request.
 */
export async function withStageDeadline<T>(
  call: Promise<T>,
  kind: string,
  ms: number = RESEARCH_STAGE_DEADLINE_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ResearchDeadlineError(kind)), ms);
  });
  try {
    return await Promise.race([call, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Characters of the source item (title, summary, readable text) given to the plan prompt. */
export const RESEARCH_ITEM_CONTEXT_MAX_CHARS = 6_000;

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
  | { stage: "outlining" }
  /** `current` is the 1-based section being written. */
  | { stage: "writing"; current: number; total: number; heading: string }
  /** Written by runs before R3; the page shows it as outlining. */
  | { stage: "synthesizing" };

/** One resumable stage of a run. */
export interface ResearchStage {
  kind: ResearchRunStepKind;
  index?: number;
}

/**
 * The research notes for one sub-question or gap. `grounded` is true when the
 * notes came from a Google Search grounded call (sources are then the pages it
 * searched); false when they came from model memory (sources, if any, are the
 * few the model recalled).
 */
export interface ResearchFinding {
  question: string;
  notes: string;
  sources: FindingSource[];
  grounded: boolean;
}

/**
 * Current durable run-state version (3, R3: outline and sections). Versions 1
 * (string findings, before R2) and 2 (structured findings, single synthesis)
 * are still read and upgraded in memory; a run that was in flight across an
 * upgrade continues with the outline and write stages.
 */
export const RESEARCH_RUN_STATE_VERSION = 3;

/**
 * Durable run state stored in `research_reports.progress`. `findings`,
 * `deepening` and `sections` hold one slot per question or report section;
 * `null` marks a slot still to do. `gaps` is absent until the gaps stage has
 * run and `outline` until the outline stage has.
 */
export interface ResearchRunState {
  version: typeof RESEARCH_RUN_STATE_VERSION;
  updatedAt: string;
  view: ResearchProgressView;
  subQuestions?: string[];
  findings: Array<ResearchFinding | null>;
  gaps?: string[];
  deepening: Array<ResearchFinding | null>;
  outline?: ResearchOutline;
  /** Section bodies (markdown without the `##` heading), one per outline section. */
  sections: Array<string | null>;
  attempts: Record<string, number>;
}

/** Version 2 state, written by R2: structured findings, one synthesis call. */
export interface ResearchRunStateV2 extends Omit<
  ResearchRunState,
  "version" | "outline" | "sections"
> {
  version: 2;
}

/** Version 1 state, written before R2: findings were `## question\n\ntext` strings. */
export interface ResearchRunStateV1 extends Omit<
  ResearchRunStateV2,
  "version" | "findings" | "deepening"
> {
  version: 1;
  findings: Array<string | null>;
  deepening: Array<string | null>;
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
    version: RESEARCH_RUN_STATE_VERSION,
    updatedAt: now,
    view: { stage: "planning" },
    findings: [],
    deepening: [],
    sections: [],
    attempts: {},
  };
}

type StoredRunState = ResearchRunState | ResearchRunStateV2 | ResearchRunStateV1;

/** Any stored version; all carry the same `view` and `updatedAt`. */
function isRunState(value: unknown): value is StoredRunState {
  const version = (value as { version?: unknown } | null)?.version;
  return (
    typeof value === "object" &&
    value !== null &&
    (version === 1 || version === 2 || version === RESEARCH_RUN_STATE_VERSION) &&
    Array.isArray((value as { findings?: unknown }).findings) &&
    Array.isArray((value as { deepening?: unknown }).deepening)
  );
}

/**
 * Converts a version 1 finding (`## question\n\ntext` with URLs inline) so a
 * run that was in flight across the upgrade can finish. Its URLs become
 * recalled (ungrounded) sources titled by domain.
 */
function upgradeFinding(
  value: string | null,
  question: string | undefined
): ResearchFinding | null {
  if (value === null) return null;
  const header = value.match(/^## (.+)\r?\n/);
  const resolvedQuestion = question ?? header?.[1]?.trim() ?? "";
  const notes = header ? value.slice(header[0].length).trim() : value.trim();
  return {
    question: resolvedQuestion,
    notes,
    sources: scrapeUrlSources(notes),
    grounded: false,
  };
}

function upgradeV1(state: ResearchRunStateV1): ResearchRunStateV2 {
  return {
    ...state,
    version: 2,
    findings: state.findings.map((finding, index) =>
      upgradeFinding(finding, state.subQuestions?.[index])
    ),
    deepening: state.deepening.map((finding, index) =>
      upgradeFinding(finding, state.gaps?.[index])
    ),
  };
}

/**
 * A version 2 run has no outline yet: once its findings are complete it
 * continues with the outline stage (a pending `synthesize` message resumes
 * there too), so every report is written the same way.
 */
function upgradeV2(state: ResearchRunStateV2): ResearchRunState {
  return { ...state, version: RESEARCH_RUN_STATE_VERSION, sections: [] };
}

/**
 * Reads the durable state; a missing or legacy flat payload starts fresh and
 * versions 1 and 2 are upgraded in memory (the next write stores version 3).
 */
export function parseResearchRunState(
  progress: string | null | undefined,
  now: string
): ResearchRunState {
  if (!progress) return initialState(now);
  try {
    const parsed: unknown = JSON.parse(progress);
    if (isRunState(parsed)) {
      if (parsed.version === 1) return upgradeV2(upgradeV1(parsed));
      if (parsed.version === 2) return upgradeV2(parsed);
      return Array.isArray(parsed.sections) ? parsed : { ...parsed, sections: [] };
    }
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

/**
 * First unfinished stage. Once every section is written the report is
 * assembled by the write stage that wrote the last one, so a state with no
 * pending section is never stored; should one be read anyway, the answer is a
 * write stage past the last section, which only assembles.
 */
export function nextResearchStage(state: ResearchRunState): ResearchStage {
  if (!state.subQuestions) return { kind: "plan" };
  const pending = state.findings.findIndex((finding) => finding === null);
  if (pending >= 0) return { kind: "search", index: pending };
  if (!state.gaps) return { kind: "gaps" };
  const pendingGap = state.deepening.findIndex((finding) => finding === null);
  if (pendingGap >= 0) return { kind: "deepen", index: pendingGap };
  if (!state.outline) return { kind: "outline" };
  const pendingSection = state.outline.sections.findIndex(
    (_, index) => (state.sections[index] ?? null) === null
  );
  if (pendingSection >= 0) return { kind: "write", index: pendingSection };
  return { kind: "write", index: state.outline.sections.length };
}

/** True once the outline exists and every one of its sections has a body. */
function isReportWritten(state: ResearchRunState): boolean {
  return (
    state.outline !== undefined &&
    state.outline.sections.every((_, index) => (state.sections[index] ?? null) !== null)
  );
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
  /** Injected in tests; used only to resolve Google grounding redirect links. */
  fetchImpl?: typeof fetch;
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
  const key = stageKey(stage);
  const ai = input.ai ?? createTenantAIRouter(context, repositories);
  if (report.status !== "running") {
    await repositories.research.updateReport(reportId, { status: "running" });
  }

  try {
    await executeStage(ai, repositories, report, state, stage, input.fetchImpl);
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
  if (isReportWritten(state)) {
    // The last section is in: assemble and complete in the same write, so a
    // stored state always has a section left to write.
    await completeReport(repositories, report, state, now().toISOString());
    return { outcome: "ran", stage, next: null };
  }
  const next = nextResearchStage(state);
  if (next.kind === "outline") state.view = { stage: "outlining" };
  if (next.kind === "write") state.view = writingView(state, next.index ?? 0);
  state.updatedAt = now().toISOString();
  await setState(repositories, reportId, state);
  return { outcome: "ran", stage, next };
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
      state.findings[index] = failedFinding(question, "(Research on this question failed.)");
      state.view = researchingView(state, index);
      return true;
    }
    case "gaps":
      setGaps(state, []);
      return true;
    case "deepen": {
      const index = stage.index ?? 0;
      const question = state.gaps?.[index] ?? report.query;
      state.deepening[index] = failedFinding(question, "(Research on this gap failed.)");
      state.view = deepeningView(state, index);
      return true;
    }
    case "synthesize":
    case "outline": {
      const { findings, catalog } = reportInputs(state);
      setOutline(state, fallbackOutline(findings, catalog));
      return true;
    }
    case "write": {
      const index = stage.index ?? 0;
      const section = state.outline?.sections[index];
      if (!section) return true;
      const ids =
        section.sourceIds.length > 0
          ? section.sourceIds
          : sectionSourceIds(reportInputs(state).catalog, section.findings);
      state.sections[index] = sectionPlaceholder(ids);
      return true;
    }
  }
}

function setOutline(state: ResearchRunState, outline: ResearchOutline): void {
  state.outline = outline;
  state.sections = outline.sections.map(() => null);
}

/** "Writing (2/5): <heading>" for the section at `index`. */
function writingView(state: ResearchRunState, index: number): ResearchProgressView {
  const sections = state.outline?.sections ?? [];
  const position = Math.min(index, Math.max(0, sections.length - 1));
  return {
    stage: "writing",
    current: position + 1,
    total: sections.length,
    heading: sections[position]?.heading ?? "",
  };
}

function sectionSourceIds(catalog: SourceCatalog, findingIndices: number[]): number[] {
  return [...new Set(findingIndices.flatMap((index) => catalog.idsByFinding[index] ?? []))];
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
      : { stage: "outlining" };
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

function failedFinding(question: string, notes: string): ResearchFinding {
  return { question, notes, sources: [], grounded: false };
}

function completedFindings(state: ResearchRunState): {
  findings: ResearchFinding[];
  deepening: ResearchFinding[];
} {
  return {
    findings: state.findings.filter((finding): finding is ResearchFinding => finding !== null),
    deepening: state.deepening.filter((finding): finding is ResearchFinding => finding !== null),
  };
}

/** The first-pass findings as markdown sections, notes only (gap analysis input). */
function combinedFindings(state: ResearchRunState): string {
  return completedFindings(state)
    .findings.map((finding) => `## ${finding.question}\n\n${finding.notes}`)
    .join("\n\n---\n\n");
}

/**
 * What the outline and section writer work from: the findings followed by the
 * deepening answers (the outline's finding indices point into this list) and
 * the numbered source catalog over them. The catalog is rebuilt from the
 * stored findings on every stage; they do not change after the outline, so the
 * `[n]` ids stay stable across stages.
 */
function reportInputs(state: ResearchRunState): {
  findings: ResearchFinding[];
  catalog: SourceCatalog;
} {
  const { findings, deepening } = completedFindings(state);
  const all = [...findings, ...deepening];
  return { findings: all, catalog: buildSourceCatalog(all) };
}

/** One finding with its numbered sources on a "Sources:" line under the heading. */
function formatFinding(
  finding: ResearchFinding,
  ids: number[],
  catalog: SourceCatalog,
  label: string
): string {
  const byId = new Map(catalog.sources.map((source) => [source.id, source]));
  const sources = ids.map((id) => byId.get(id)).filter((source) => source !== undefined);
  const line =
    sources.length > 0 ? `Sources: ${formatSourceList(sources).split("\n").join("; ")}\n\n` : "";
  return `### ${label}${finding.question}\n\n${line}${finding.notes}`;
}

/**
 * The outline prompt over the usable findings, numbered F1..Fk, and the run
 * finding index behind each F number.
 */
export function buildOutlinePrompt(query: string, state: ResearchRunState) {
  const { findings, catalog } = reportInputs(state);
  let usable = findings.flatMap((finding, index) => (isUsableFinding(finding) ? [index] : []));
  if (usable.length === 0) usable = findings.map((_, index) => index);
  const text = usable
    .map((index, position) =>
      formatFinding(
        findings[index]!,
        catalog.idsByFinding[index] ?? [],
        catalog,
        `F${position + 1}. `
      )
    )
    .join("\n\n");
  const prompt = researchOutlinePrompt(query, text, catalog.sources.length > 0);
  return { prompt, catalog, usable };
}

/** The writer prompt for one outline section, from that section's findings only. */
export function buildSectionPrompt(query: string, state: ResearchRunState, index: number) {
  const outline = state.outline!;
  const section = outline.sections[index]!;
  const { findings, catalog } = reportInputs(state);
  const text = section.findings
    .filter((position) => findings[position] !== undefined)
    .map((position) =>
      formatFinding(findings[position]!, catalog.idsByFinding[position] ?? [], catalog, "")
    )
    .join("\n\n");
  const hasSources = section.findings.some(
    (position) => (catalog.idsByFinding[position] ?? []).length > 0
  );
  return researchSectionPrompt({
    query,
    shape: outline.shape,
    headings: outline.sections.map((entry) => entry.heading),
    index,
    purpose: section.purpose,
    format: section.format,
    findings: text || "(No findings were assigned to this section.)",
    hasSources,
  });
}

/**
 * Assembles the written sections into the stored markdown report, keeps only
 * the cited sources (renumbered 1..k across the whole document) and completes
 * the report. Logs counts only.
 */
async function completeReport(
  repositories: RepositorySet,
  report: ResearchReportRecord,
  state: ResearchRunState,
  completedAt: string
): Promise<void> {
  const outline = state.outline!;
  const sections = outline.sections.map(
    (section, index) => state.sections[index] ?? sectionPlaceholder(section.sourceIds)
  );
  const { catalog } = reportInputs(state);
  const cited = finalizeCitations(assembleReport(outline, sections), catalog.sources);
  await repositories.research.updateReport(report.id, {
    report: cited.report,
    sources: JSON.stringify(cited.sources),
    status: "completed",
    completedAt,
    progress: null,
  });
  const placeholders = sections.filter(isSectionPlaceholder).length;
  aiLogger.info(
    {
      event: "research_report_assembled",
      jobId: report.id,
      count: countSectionWords(cited.report),
      // Counts only, packed into one allowlisted identifier field.
      code: `shape-${outline.shape}.sections-${sections.length}.placeholders-${placeholders}.cited-${cited.sources.length}-of-${catalog.sources.length}${outline.fallback ? ".fallback" : ""}`,
    },
    "Research report assembled"
  );
}

/**
 * Turns one search-facade answer into a finding. Grounded answers keep the
 * pages grounding returned (redirect links resolved); ungrounded answers keep
 * the few sources the model recalled in its trailing JSON block. The block is
 * stripped from the notes either way.
 */
async function toFinding(
  question: string,
  result: SearchTextResult,
  jobId: string,
  fetchImpl?: typeof fetch
): Promise<ResearchFinding> {
  const { notes, sources: recalled } = extractRecalledSources(result.text);
  if (!result.grounded) return { question, notes, sources: recalled, grounded: false };
  const sources = await resolveGroundingRedirects(result.sources, { fetchImpl });
  // Counts only (no URLs), so an unresolved redirect can be told apart: over the cap vs failed.
  const redirects = result.sources.filter((source) => isGroundingRedirect(source.url)).length;
  aiLogger.info(
    {
      event: "research_grounding_sources",
      jobId,
      sources: result.sources.length,
      redirects,
      overCap: Math.max(0, redirects - MAX_GROUNDING_RESOLUTIONS),
      unresolved: sources.filter((source) => isGroundingRedirect(source.url)).length,
    },
    "Research grounding sources resolved"
  );
  return { question, notes, sources, grounded: true };
}

function notesPrompts(question: string, kind: "question" | "gap") {
  return {
    grounded: researchNotesPrompt(question, { grounded: true, kind }),
    ungrounded: researchNotesPrompt(question, { grounded: false, kind }),
  };
}

async function executeStage(
  ai: ResearchAI,
  repositories: RepositorySet,
  report: ResearchReportRecord,
  state: ResearchRunState,
  stage: ResearchStage,
  fetchImpl?: typeof fetch
): Promise<void> {
  switch (stage.kind) {
    case "plan": {
      let itemContext: string | undefined;
      if (report.itemId) {
        const item = await repositories.items.findById(report.itemId);
        if (item) {
          itemContext = itemPlanContext(item);
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
      const result = await ai.generateTextWithSearch(notesPrompts(question, "question"), {
        timeoutMs: RESEARCH_TIMEOUTS_MS.search,
        maxTokens: RESEARCH_SEARCH_MAX_TOKENS,
      });
      state.findings[index] = await toFinding(question, result, report.id, fetchImpl);
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
      const result = await ai.generateTextWithSearch(notesPrompts(question, "gap"), {
        timeoutMs: RESEARCH_TIMEOUTS_MS.search,
        maxTokens: RESEARCH_SEARCH_MAX_TOKENS,
      });
      state.deepening[index] = await toFinding(question, result, report.id, fetchImpl);
      state.view = deepeningView(state, index);
      return;
    }
    case "synthesize":
    case "outline": {
      // `synthesize` is never computed from state since R3; kept for exhaustiveness.
      const { prompt, catalog, usable } = buildOutlinePrompt(report.query, state);
      const raw = await withStageDeadline(
        ai.generateJSON<unknown>(prompt, "research-synthesize", {
          timeoutMs: RESEARCH_TIMEOUTS_MS.outline,
          maxTokens: researchReportMaxTokens("outline"),
          maxAttempts: 1,
          rejectTruncated: true,
          responseSchema: OUTLINE_RESPONSE_SCHEMA,
          thinking: "low",
        }),
        "outline"
      );
      // Invalid JSON or an unusable outline throws: the stage retries, then falls back.
      const outline = parseOutline(raw, usable, catalog);
      setOutline(state, outline);
      aiLogger.info(
        {
          event: "research_outline_planned",
          jobId: report.id,
          count: outline.sections.length,
          code: `shape-${outline.shape}.takeaways-${outline.takeaways.length}.caveats-${outline.caveats.length}`,
        },
        "Research outline planned"
      );
      return;
    }
    case "write": {
      const index = stage.index ?? 0;
      const section = state.outline?.sections[index];
      // Past the last section: nothing to write, the caller assembles.
      if (!section) return;
      const answer = await withStageDeadline(
        ai.generateText(buildSectionPrompt(report.query, state, index), "research-synthesize", {
          timeoutMs: RESEARCH_TIMEOUTS_MS.write,
          maxTokens: researchReportMaxTokens("write"),
          maxAttempts: 1,
          rejectTruncated: true,
          thinking: "low",
        }),
        "write"
      );
      // A cut-off or near-empty answer fails the attempt so the stage is retried.
      state.sections[index] = cleanSectionBody(answer, section.heading);
      return;
    }
  }
}

/**
 * The source item as plan context: title, stored summary and the article reduced from HTML to
 * readable text, capped at {@link RESEARCH_ITEM_CONTEXT_MAX_CHARS} (the plan needs the gist, not
 * the whole article).
 */
export function itemPlanContext(item: {
  title?: string | null;
  summary?: string | null;
  fullContent?: string | null;
}): string | undefined {
  const text = [item.title, item.summary, htmlToReadableText(item.fullContent)]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n\n");
  if (!text) return undefined;
  if (text.length <= RESEARCH_ITEM_CONTEXT_MAX_CHARS) return text;
  const cut = text.slice(0, RESEARCH_ITEM_CONTEXT_MAX_CHARS);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > RESEARCH_ITEM_CONTEXT_MAX_CHARS - 200 ? space : undefined)}…`;
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
