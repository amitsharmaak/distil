/**
 * Capture triage contract: the junk-page verdict and priority score produced once per
 * generic article capture, before any item or summary exists.
 *
 * Pure and dependency-free so the capture worker, the AI task, the eval script and
 * client components can all share it. The AI call itself lives in
 * `src/lib/ai/triage-capture.ts`.
 */

export const TRIAGE_PROMPT_VERSION = "triage-v1";

export const TRIAGE_JUNK_KINDS = [
  "login_wall",
  "paywall_stub",
  "consent_wall",
  "error_page",
  "bot_check",
  "empty_shell",
] as const;
export type TriageJunkKind = (typeof TRIAGE_JUNK_KINDS)[number];
export type TriageKind = "content" | TriageJunkKind;

/** A junk verdict below this confidence never rejects a capture. */
export const JUNK_REJECT_MIN_CONFIDENCE = 0.9;
/** Pages with at least this much readable text are never rejected as junk. */
export const JUNK_REJECT_MAX_READABLE_CHARS = 3_000;
export const TRIAGE_EXCERPT_MAX_CHARS = 2_000;
export const CAPTURE_JUNK_ERROR_CODE = "CONTENT_JUNK";

export interface CaptureTriageInput {
  url: string;
  site?: string;
  title?: string;
  author?: string;
  publication?: string;
  /** Opening readable text, at most TRIAGE_EXCERPT_MAX_CHARS. */
  excerpt: string;
  /** Length of the full readable text, not just the excerpt. */
  readableChars: number;
  preferenceSummary?: string;
}

export interface CaptureTriageVerdict {
  kind: TriageKind;
  readable: boolean;
  /** 0..1 */
  confidence: number;
  /** Integer 0..100, same scale as `prioritize`. */
  priorityScore: number;
  /** One sentence, at most 200 characters. */
  reason: string;
  model: string;
  promptVersion: string;
}

export interface StoredCaptureTriage extends CaptureTriageVerdict {
  triagedAt: string;
  /** False when the verdict was recorded in shadow mode and could not reject. */
  enforced: boolean;
}

export type CaptureTriage = (input: CaptureTriageInput) => Promise<CaptureTriageVerdict>;
export type CaptureTriageMode = "on" | "shadow" | "off";

export interface JunkRejectionGuards {
  readableChars: number;
  hasUserNotes: boolean;
  explicitHighPriority: boolean;
}

const JUNK_KIND_SET: ReadonlySet<string> = new Set(TRIAGE_JUNK_KINDS);

function isJunkKind(kind: string): kind is TriageJunkKind {
  return JUNK_KIND_SET.has(kind);
}

/** Conservative gate: reject only a confident junk verdict on a short page the user gave no signal about. */
export function shouldRejectAsJunk(
  verdict: CaptureTriageVerdict,
  guards: JunkRejectionGuards
): boolean {
  return (
    isJunkKind(verdict.kind) &&
    !verdict.readable &&
    verdict.confidence >= JUNK_REJECT_MIN_CONFIDENCE &&
    guards.readableChars < JUNK_REJECT_MAX_READABLE_CHARS &&
    !guards.hasUserNotes &&
    !guards.explicitHighPriority
  );
}

const JUNK_DESCRIPTIONS: Record<TriageJunkKind, string> = {
  login_wall: "a sign-in page",
  paywall_stub: "a paywall preview",
  consent_wall: "a cookie or consent page",
  error_page: "an error page",
  bot_check: "a bot check",
  empty_shell: "an empty page",
};

export function junkRejectionMessage(kind: TriageJunkKind): string {
  return `This looked like ${JUNK_DESCRIPTIONS[kind]}, not an article. Save it again to keep it anyway.`;
}

/** Tolerant read of `{ triage: {...} }` from `items.content_classification`. */
export function storedTriageOf(contentClassification: unknown): StoredCaptureTriage | undefined {
  if (!contentClassification || typeof contentClassification !== "object") return undefined;
  const triage = (contentClassification as { triage?: unknown }).triage;
  if (!triage || typeof triage !== "object") return undefined;
  const value = triage as Record<string, unknown>;
  const score = value.priorityScore;
  const confidence = value.confidence;
  if (typeof score !== "number" || !Number.isFinite(score)) return undefined;
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return undefined;
  if (typeof value.kind !== "string" || (value.kind !== "content" && !isJunkKind(value.kind))) {
    return undefined;
  }
  return {
    kind: value.kind as TriageKind,
    readable: value.readable === true,
    confidence: Math.min(1, Math.max(0, confidence)),
    priorityScore: Math.min(100, Math.max(0, Math.round(score))),
    reason: typeof value.reason === "string" ? value.reason : "",
    model: typeof value.model === "string" ? value.model : "",
    promptVersion: typeof value.promptVersion === "string" ? value.promptVersion : "",
    triagedAt: typeof value.triagedAt === "string" ? value.triagedAt : "",
    enforced: value.enforced === true,
  };
}
