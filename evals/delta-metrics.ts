/**
 * Delta check for detailed summaries (adaptive summaries S2).
 *
 * A detailed summary is shown under the brief, so it should add information rather than
 * restate the brief. Two deterministic signals:
 *
 * - restatement: the share of the detailed text's word trigrams that already occur in the
 *   brief. Rewording a brief point keeps many of its trigrams; new material does not.
 * - novel specifics: numbers and proper names in the detailed items that occur in the source
 *   but not in the brief. Specifics the source does not contain are counted separately as
 *   ungrounded, a hallucination signal.
 *
 * Pure and dependency-free, like metrics.ts.
 */

export interface DeltaCase {
  id: string;
  /** The text the summaries were written from. */
  source: string;
  brief: {
    overview: string;
    sections: Array<{ heading: string; items: string[] }>;
    openQuestions: string[];
  };
  detailed: Array<{ heading: string; deepens?: string; items: string[] }>;
}

export interface DeltaCaseResult {
  id: string;
  sourceWords: number;
  detailedSections: number;
  detailedWords: number;
  /** Detailed word trigrams also in the brief / all detailed word trigrams. */
  restatement: number;
  /** Detailed specifics found in the source and absent from the brief. */
  novelSpecifics: string[];
  /** Detailed specifics not found in the source. */
  ungroundedSpecifics: string[];
  /** Open questions named by some section's `deepens` / all open questions. */
  openQuestionsAddressed: number;
  pass: boolean;
}

export interface DeltaMetrics {
  meanRestatement: number;
  meanNovelSpecifics: number;
  meanUngroundedSpecifics: number;
  meanOpenQuestionsAddressed: number;
  passRate: number;
  perCase: DeltaCaseResult[];
}

/** At most this share of detailed trigrams may already be in the brief. */
export const MAX_RESTATEMENT = 0.15;
/** A detailed summary of a substantial source must add at least this many specifics. */
export const MIN_NOVEL_SPECIFICS = 3;
/** Below this many source words, one "the brief covers it" section is a pass. */
export const SHORT_SOURCE_WORDS = 600;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function trigrams(text: string): string[] {
  const tokens = words(text);
  const out: string[] = [];
  for (let i = 0; i + 2 < tokens.length; i++) out.push(tokens.slice(i, i + 3).join(" "));
  return out;
}

const NAME_STOPWORDS = new Set(
  "a an and as at but by for from how i if in into it its of on or so that the their then there these they this those to we what when where which who why with you your".split(
    " "
  )
);

/**
 * Numbers (with their unit sign) and capitalised words that do not start a sentence, as
 * lower-cased strings. Deliberately simple: it only has to rank deltas consistently.
 */
export function extractSpecifics(text: string): Set<string> {
  const out = new Set<string>();
  for (const match of text.matchAll(/[$£€]?\d[\d,.]*\s?(?:%|x\b|k\b|m\b|bn\b)?/gi)) {
    const value = match[0].replace(/[,\s]/g, "").replace(/\.$/, "").toLowerCase();
    if (value) out.add(value);
  }
  for (const sentence of text.split(/(?<=[.!?:])\s+|\n+/)) {
    const tokens = sentence.split(/\s+/).filter(Boolean);
    tokens.slice(1).forEach((token) => {
      const word = token.replace(/^[^\p{L}]+|[^\p{L}\p{N}]+$/gu, "");
      if (/^\p{Lu}[\p{L}\p{N}-]+$/u.test(word) && !NAME_STOPWORDS.has(word.toLowerCase())) {
        out.add(word.toLowerCase());
      }
    });
  }
  return out;
}

function contains(haystack: string, needle: string): boolean {
  if (/^[$£€]?\d/.test(needle)) {
    return haystack.replace(/[,\s]/g, "").includes(needle);
  }
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`,
    "u"
  ).test(haystack);
}

function briefText(brief: DeltaCase["brief"]): string {
  return [brief.overview, ...brief.sections.flatMap((s) => [s.heading, ...s.items])].join("\n");
}

function normalizeQuestion(value: string): string {
  return words(value).join(" ");
}

export function evaluateDeltaCase(input: DeltaCase): DeltaCaseResult {
  const brief = briefText(input.brief);
  const detailed = input.detailed.flatMap((s) => [s.heading, ...s.items]).join("\n");

  const briefTrigrams = new Set(trigrams(brief));
  const detailedTrigrams = trigrams(detailed);
  const restatement = detailedTrigrams.length
    ? detailedTrigrams.filter((gram) => briefTrigrams.has(gram)).length / detailedTrigrams.length
    : 0;

  const source = input.source.toLowerCase();
  const briefLower = brief.toLowerCase();
  const novelSpecifics: string[] = [];
  const ungroundedSpecifics: string[] = [];
  // Items only: headings are Title Case, so every heading word would read as a name.
  const detailedItems = input.detailed.flatMap((s) => s.items).join("\n");
  for (const specific of extractSpecifics(detailedItems)) {
    if (!contains(source, specific)) ungroundedSpecifics.push(specific);
    else if (!contains(briefLower, specific)) novelSpecifics.push(specific);
  }

  const deepens = new Set(
    input.detailed.map((s) => (s.deepens ? normalizeQuestion(s.deepens) : "")).filter(Boolean)
  );
  const openQuestionsAddressed = input.brief.openQuestions.length
    ? input.brief.openQuestions.filter((q) => deepens.has(normalizeQuestion(q))).length /
      input.brief.openQuestions.length
    : 1;

  const sourceWords = words(input.source).length;
  const briefCoversShortSource = sourceWords < SHORT_SOURCE_WORDS && input.detailed.length <= 1;
  return {
    id: input.id,
    sourceWords,
    detailedSections: input.detailed.length,
    detailedWords: words(detailed).length,
    restatement,
    novelSpecifics,
    ungroundedSpecifics,
    openQuestionsAddressed,
    pass:
      restatement <= MAX_RESTATEMENT &&
      (novelSpecifics.length >= MIN_NOVEL_SPECIFICS || briefCoversShortSource),
  };
}

export function evaluateDelta(cases: DeltaCase[]): DeltaMetrics {
  const perCase = cases.map(evaluateDeltaCase);
  const mean = (pick: (r: DeltaCaseResult) => number) =>
    perCase.length ? perCase.reduce((sum, r) => sum + pick(r), 0) / perCase.length : 0;
  return {
    meanRestatement: mean((r) => r.restatement),
    meanNovelSpecifics: mean((r) => r.novelSpecifics.length),
    meanUngroundedSpecifics: mean((r) => r.ungroundedSpecifics.length),
    meanOpenQuestionsAddressed: mean((r) => r.openQuestionsAddressed),
    passRate: mean((r) => (r.pass ? 1 : 0)),
    perCase,
  };
}
