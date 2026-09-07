import type { SummaryOutput } from "@/lib/ai/types";

const HTML_TAG_PATTERN = /<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\s*\/?>/i;

const BOILERPLATE_LINE_PATTERN = new RegExp(
  `^(?:${[
    "accept (?:all )?cookies?",
    "cookie (?:preferences|settings|policy)",
    "manage (?:cookie )?preferences",
    "sign in(?: to continue)?",
    "log in(?: to continue)?",
    "create (?:an )?account",
    "enable javascript",
    "verify (?:that )?you are human",
    "checking your browser",
    "access denied",
    "subscribe(?: now)?",
    "subscription required",
    "already a subscriber",
    "continue reading",
    "navigation menu",
  ].join("|")})(?:[.!])?$`,
  "i"
);

export const ARTICLE_MIN_CHARACTERS = 80;
export const ARTICLE_MIN_WORDS = 12;
export const SUMMARY_INPUT_MAX_CHARACTERS = 48_000;

export class SummaryOutputValidationError extends Error {
  readonly category = "invalid_output" as const;

  constructor(reason: string) {
    super(reason);
    this.name = "SummaryOutputValidationError";
  }
}

export function containsMeaningfulHtml(value: string): boolean {
  return HTML_TAG_PATTERN.test(value);
}

/** Normalize plain text and remove isolated browser/paywall chrome lines. */
export function normalizePlaintext(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ");

  const paragraphs = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => line.length > 180 || !BOILERPLATE_LINE_PATTERN.test(line));

  return paragraphs
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isUsableArticleText(value: string): boolean {
  if (!value || containsMeaningfulHtml(value)) return false;
  const normalized = normalizePlaintext(value);
  if (normalized.length < ARTICLE_MIN_CHARACTERS) return false;
  return normalized.split(/\s+/).filter(Boolean).length >= ARTICLE_MIN_WORDS;
}

/** Select bounded capture-time input while retaining both opening and conclusion. */
export function prepareCaptureSummaryInput(value: string): string {
  const normalized = normalizePlaintext(value);
  if (normalized.length <= SUMMARY_INPUT_MAX_CHARACTERS) return normalized;
  return normalized.slice(0, 36_000) + normalized.slice(-12_000);
}

function sentenceCount(value: string): number {
  return (value.match(/[^.!?]+[.!?]+(?:["')\]]+)?(?=\s|$)/g) ?? []).length;
}

function normalizeSummaryField(value: unknown): string | null {
  if (typeof value !== "string" || containsMeaningfulHtml(value)) return null;
  const normalized = normalizePlaintext(value);
  if (!normalized || BOILERPLATE_LINE_PATTERN.test(normalized)) return null;
  return normalized;
}

function quoteText(value: string): string {
  const quoted = value.match(/["“]([^"”]+)["”]/)?.[1];
  return normalizePlaintext(quoted ?? value.replace(/^[-*\s]+/, ""));
}

function comparable(value: string): string {
  return normalizePlaintext(value).toLocaleLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}

/** Validate untrusted model output and remove quotes unsupported by the source. */
export function validateSummaryOutput(
  value: unknown,
  source: string,
  length: "brief" | "detailed" = "brief"
): SummaryOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SummaryOutputValidationError("Invalid structured summary");
  }
  const candidate = value as Record<string, unknown>;
  const overview = normalizeSummaryField(candidate.overview);
  const overviewSentences = overview ? sentenceCount(overview) : 0;
  if (!overview || overviewSentences < 2 || overviewSentences > 3) {
    throw new SummaryOutputValidationError("Invalid structured summary overview");
  }

  if (!Array.isArray(candidate.keyPoints)) {
    throw new SummaryOutputValidationError("Invalid structured summary key points");
  }
  const keyPoints = candidate.keyPoints.map(normalizeSummaryField);
  const minPoints = length === "brief" ? 3 : 5;
  const maxPoints = length === "brief" ? 5 : 8;
  if (
    keyPoints.length < minPoints ||
    keyPoints.length > maxPoints ||
    keyPoints.some((point) => point === null)
  ) {
    throw new SummaryOutputValidationError("Invalid structured summary key points");
  }

  const whyItMatters =
    candidate.whyItMatters == null || candidate.whyItMatters === ""
      ? undefined
      : normalizeSummaryField(candidate.whyItMatters);
  if (candidate.whyItMatters != null && candidate.whyItMatters !== "" && !whyItMatters) {
    throw new SummaryOutputValidationError("Invalid structured summary significance");
  }

  if (candidate.notableQuotes != null && !Array.isArray(candidate.notableQuotes)) {
    throw new SummaryOutputValidationError("Invalid structured summary quotes");
  }
  const comparableSource = comparable(source);
  const notableQuotes = (candidate.notableQuotes ?? [])
    .map(normalizeSummaryField)
    .filter((quote): quote is string => quote !== null)
    .filter((quote) => comparableSource.includes(comparable(quoteText(quote))));

  return {
    overview,
    keyPoints: keyPoints as string[],
    ...(whyItMatters ? { whyItMatters } : {}),
    ...(notableQuotes.length > 0 ? { notableQuotes } : {}),
  };
}

/** Build a conservative non-AI summary from complete source sentences only. */
export function createExtractiveSummary(value: string, maxCharacters = 500): string | null {
  const normalized = normalizePlaintext(value).replace(/\n+/g, " ");
  if (!isUsableArticleText(normalized)) return null;

  const sentences = normalized.match(/[^.!?]+[.!?]+(?:["')\]]+)?(?=\s|$)/g) ?? [];
  if (sentences.length < 2) return null;

  const selected: string[] = [];
  for (const sentence of sentences.slice(0, 3)) {
    const next = [...selected, sentence.trim()].join(" ");
    if (next.length > maxCharacters) break;
    selected.push(sentence.trim());
  }

  if (selected.length < 2) return null;
  const summary = selected.join(" ");
  return isUsableArticleText(summary) && summary.length <= maxCharacters ? summary : null;
}
