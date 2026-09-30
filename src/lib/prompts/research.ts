/**
 * Prompt templates for deep research reports.
 *
 * Used by src/lib/ai/research.ts.
 */

/**
 * Plan prompt. The sub-questions follow the kind of question asked (the same idea as the adaptive
 * brief's shapes) instead of a fixed background / current state / players / outlook list.
 * `context` is the source item as readable text, already capped by the caller.
 */
export function researchPlanPrompt(query: string, context?: string): string {
  return `You are a research assistant planning a research report. Choose the questions to investigate so the report answers what this particular question needs.

## Research Topic
${query}

${context ? `## Context from Source Article\n${context}\n` : ""}
## Instructions
First decide what kind of question this is, then pick 3-5 specific sub-questions that a report of that kind needs. For example:
- Explainer ("what is", "how does"): the mechanism, the key components or concepts, concrete examples, limits and misconceptions.
- Comparison ("X vs Y", "which is better"): each option on its own terms, then the criteria that separate them (cost, performance, fit), with figures.
- Landscape ("main approaches", "who is doing"): the distinct approaches or players, what distinguishes each, evidence of adoption, where it is heading.
- Decision ("should I", "is it worth"): the options, costs and benefits with figures, risks, who each option suits.
- How-to: prerequisites, the steps, common pitfalls, how to check it worked.
- Timeline ("history of", "what changed"): the milestones with dates, what drove each change, the current state.
Each sub-question should be answerable with specific facts, figures, dates or named examples. Do not add generic background or outlook questions the report does not need.

Output a JSON array of strings (the sub-questions):
["question 1", "question 2", ...]

Output ONLY the JSON array, no other text.`;
}

/**
 * Search and deepening prompt. The grounded variant runs with Google Search;
 * the ungrounded variant is the plain-generation fallback, which also asks for
 * a trailing `sources` JSON block of at most three recalled sources (parsed by
 * `extractRecalledSources` in `src/lib/ai/research-sources.ts`).
 */
export function researchNotesPrompt(
  question: string,
  options: { grounded: boolean; kind: "question" | "gap" }
): string {
  const task =
    options.kind === "gap"
      ? "Research this specific gap in earlier findings and write focused, concise research notes."
      : "Research this question thoroughly and write detailed research notes.";
  const ungrounded = options.grounded
    ? ""
    : `
You cannot search the web for this answer: answer from what you know and say when a fact may be out of date.

After the notes, end with a fenced code block tagged \`sources\` that holds a JSON array of at most three sources you are confident exist and that support these notes, each an object with "title" and "url". Use an empty array if you are not confident about any. For example:
\`\`\`sources
[{"title": "Example report title", "url": "https://example.org/report"}]
\`\`\`
`;
  return `You are a research assistant. ${task}

## Question
${question}

## Instructions
Write notes a report writer can use directly:
- Specific facts, figures and dates, each attributed to the organisation, product, study or person it comes from.
- Named examples, products and case studies rather than generalities.
- Where sources disagree or the evidence is thin, say so and describe each position.
- Short markdown bullets grouped under small headings; no introduction or conclusion.

Do not put URLs or links anywhere in the notes; sources are tracked separately.
${ungrounded}`;
}

/** Report shapes the outline stage picks from (the question type decides the structure). */
export const RESEARCH_REPORT_SHAPES = [
  "explainer",
  "comparison",
  "landscape",
  "decision",
  "how-to",
  "timeline",
  "other",
] as const;
export type ResearchReportShape = (typeof RESEARCH_REPORT_SHAPES)[number];

/** How one report section presents its content. */
export const RESEARCH_SECTION_FORMATS = ["prose", "table", "steps", "bullets"] as const;
export type ResearchSectionFormat = (typeof RESEARCH_SECTION_FORMATS)[number];

const CITE_RULE = `Cite with the bracketed numbers from the "Sources:" line of the finding a claim comes from, right after the claim, for example "... in 2025 [2]" or "... [1][3]". Use only numbers that appear in those lines. Never write URLs or links.`;
/**
 * Per-claim citation for the section writer: each finding lists its sources by number and title,
 * so the writer picks the one(s) behind each claim instead of repeating the whole list (the
 * 2026-09-30 probe cited both of a finding's sources on nearly every sentence).
 */
const SECTION_CITE_RULE = `${CITE_RULE} Cite only the source or sources that support that specific claim, chosen by their titles; do not attach every source of a finding to each sentence. When no single source clearly fits, cite the one whose title fits best.`;
const NO_SOURCES_RULE = `No sources are available for these findings. Do not add citation numbers, URLs or links.`;

/**
 * Outline prompt (JSON). `findings` lists each finding as `### F<n>. question` with its numbered
 * sources on a "Sources:" line, as synthesis did in R2. The outline decides the report's shape,
 * writes the TL;DR, key takeaways and caveats itself, and assigns findings to 3-4 sections that the
 * section writer then expands one call at a time (the whole report stays within 2,500 words).
 */
export function researchOutlinePrompt(query: string, findings: string, hasSources = false): string {
  return `You are a research editor planning a report from research notes. You write the short parts yourself and plan the sections a writer will expand.

## Research Question
${query}

## Research Findings
${findings}

## Instructions
1. "shape": the kind of report this question needs, one of ${RESEARCH_REPORT_SHAPES.join(", ")}.
   - explainer: how something works; comparison: options side by side; landscape: the approaches or players in a field; decision: whether or which to choose; how-to: steps to do something; timeline: how something developed.
2. "tldr": 2-3 short sentences, at most 60 words in total, that directly answer the research question with the most important specifics.
3. "takeaways": 3-5 key takeaways. Each is one sentence carrying a concrete fact from the findings (a figure, date, name or measured result), not advice.
4. "sections": 3-4 sections that together answer the question, in reading order (never more than 4; the whole report is at most 2,500 words, so group related findings into one section), each with:
   - "heading": written for this question and specific to its content (not "Introduction", "Analysis", "Key Findings" or "Conclusion").
   - "purpose": one sentence on what the section must establish.
   - "findings": the F numbers of the findings the section draws on (every useful finding should be used by at least one section).
   - "sourceIds": the source numbers from those findings' "Sources:" lines the section should cite (empty when there are none).
   - "format": "table" when the content compares several items on the same attributes (a comparison report should have at least one), "steps" for a sequence the reader follows, "bullets" for a set of separate points, otherwise "prose".
   Avoid sections that overlap; do not add a summary, takeaways or conclusion section (those are written separately).
5. "caveats": 1-4 caveats or open questions: where the findings disagree, are thin, may be out of date, or leave the question unanswered.

${hasSources ? CITE_RULE : NO_SOURCES_RULE} In "tldr", "takeaways" and "caveats", put the citations inside the text.

Output a JSON object with exactly these keys:
{"shape": "...", "tldr": "...", "takeaways": ["..."], "sections": [{"heading": "...", "purpose": "...", "findings": [1], "sourceIds": [1], "format": "prose"}], "caveats": ["..."]}
Output ONLY the JSON object, no other text.`;
}

export interface ResearchSectionPromptInput {
  query: string;
  shape: ResearchReportShape;
  /** Every section heading in reading order, so the writer does not cover the others' ground. */
  headings: string[];
  /** Position of this section in `headings`. */
  index: number;
  purpose: string;
  format: ResearchSectionFormat;
  /** The findings this section draws on, each with its "Sources:" line. */
  findings: string;
  hasSources: boolean;
  /** Word range for this section's body, from the report's 2,500-word budget. */
  words: { min: number; max: number };
}

const FORMAT_RULES: Record<ResearchSectionFormat, string> = {
  prose:
    "Write clear paragraphs of 3-5 sentences. Use a short bullet list only where it genuinely helps.",
  table:
    "Include one GitHub-flavoured markdown table (a header row, a separator row like | --- | --- |, then one row per item) comparing the items on the attributes that matter, with figures in the cells where the findings give them. Put 1-3 sentences before the table saying what it compares and 1-3 sentences after it on what stands out. Keep cells short.",
  steps:
    "Write a numbered list of steps in the order the reader follows them; each step starts with the action and adds the specifics (versions, settings, figures) the findings give. Add a sentence of context before the list.",
  bullets:
    "Write a bullet list; each bullet starts with a short bold lead-in, then one or two sentences with the specifics. Add a sentence of context before the list.",
};

/**
 * Section writer prompt: one section of the report from the findings the outline assigned it.
 * The writer returns the body only; assembly adds the `## heading`.
 */
export function researchSectionPrompt(input: ResearchSectionPromptInput): string {
  const heading = input.headings[input.index] ?? "";
  const plan = input.headings
    .map(
      (entry, position) =>
        `${position + 1}. ${entry}${position === input.index ? "  ← this section" : ""}`
    )
    .join("\n");
  return `You are writing one section of a research report (a ${input.shape} report).

## Research Question
${input.query}

## Report Sections
${plan}

## This Section
Heading: ${heading}
Purpose: ${input.purpose}

## Findings For This Section
${input.findings}

## Instructions
Write the body of the section "${heading}": about ${input.words.min}-${input.words.max} words, never more than ${input.words.max} (the report has a fixed length budget), for a knowledgeable reader who wants depth and clarity.
- Keep the specific facts, figures, dates and named examples from the findings; do not generalise them away. Use only these findings; where they disagree or are thin, say so.
- Stay on this section's purpose; the other sections cover their own headings.
- ${FORMAT_RULES[input.format]}
- ${input.hasSources ? SECTION_CITE_RULE : NO_SOURCES_RULE}
- Do not repeat the heading and do not start with a heading; the heading is added for you. Use ### subheadings only if the section clearly needs them, never # or ##.
- No introduction to the report, no conclusion or summary of the whole report, no Sources or References list.

Respond with the section body only. Do not include notes, planning or reasoning.`;
}

export function researchGapsPrompt(query: string, findings: string): string {
  return `You are a research assistant reviewing initial findings to identify knowledge gaps.

## Original Research Question
${query}

## Initial Research Findings
${findings}

## Instructions
Review the findings above. Identify 1-2 specific gaps or unanswered questions that would significantly improve the research if investigated further. Focus on:
- Missing or thin coverage on important aspects
- Contradictory or unclear information that needs verification
- Recent developments that may not be fully captured

Output a JSON object with this exact structure:
{
  "gaps": ["gap question 1", "gap question 2"]
}

If the findings are already comprehensive, use an empty array: { "gaps": [] }
Output ONLY the JSON object, no other text.`;
}
