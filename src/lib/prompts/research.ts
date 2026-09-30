/**
 * Prompt templates for deep research reports.
 *
 * Used by src/lib/ai/research.ts.
 */

export function researchPlanPrompt(query: string, context?: string): string {
  return `You are a research assistant. The user wants to learn more about a topic. Plan the research by identifying key questions to investigate.

## Research Topic
${query}

${context ? `## Context from Source Article\n${context}\n` : ""}

## Instructions
Identify 3-5 specific sub-questions that would give the user a comprehensive understanding of this topic. Consider:
- Background and fundamentals
- Current state and recent developments
- Key players and perspectives
- Implications and future outlook

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

export function researchSynthesizePrompt(query: string, findings: string, sourceList = ""): string {
  const citations = sourceList
    ? `Cite sources only with their bracketed numbers from the numbered source list, placed right after the claim they support, for example "... in 2025 [2]" or "... [1][3]". Only use numbers from the list. Never write URLs or links, and do not add a Sources or References section; the source list is shown separately.`
    : `No sources are available for these findings. Do not add citation numbers, URLs or a Sources section.`;
  return `You are a research assistant synthesizing findings into a comprehensive report.

## Original Research Question
${query}

## Research Findings
${findings}
${sourceList ? `\n## Numbered Sources\n${sourceList}\n` : ""}
## Instructions
Write a well-structured research report in markdown with:

1. **Executive Summary** — 3-5 sentence overview of key findings
2. **Key Findings** — organized by theme, keeping the specific facts, figures, dates and named examples from the findings
3. **Analysis** — connections between findings, implications, and your assessment
4. **Conclusion** — summary and suggested next steps for the reader

${citations}

Use clean, professional markdown formatting. Write for a knowledgeable reader who wants depth but also clarity.`;
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
