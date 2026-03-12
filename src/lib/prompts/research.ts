/**
 * Prompt templates for deep research reports.
 *
 * Used by src/lib/ai/research.ts.
 */

export function researchPlanPrompt(
  query: string,
  context?: string,
): string {
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

export function researchSynthesizePrompt(
  query: string,
  findings: string,
): string {
  return `You are a research assistant synthesizing findings into a comprehensive report.

## Original Research Question
${query}

## Research Findings
${findings}

## Instructions
Write a well-structured research report in markdown with:

1. **Executive Summary** — 3-5 sentence overview of key findings
2. **Key Findings** — organized by theme, with inline source links where available
3. **Analysis** — connections between findings, implications, and your assessment
4. **Conclusion** — summary and suggested next steps for the reader

Use clean, professional markdown formatting. Include source links where they were provided in the findings. Write for a knowledgeable reader who wants depth but also clarity.`;
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
