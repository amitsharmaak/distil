/**
 * Prompt templates for content summarization.
 *
 * Used by the AI summarization pipeline (src/lib/ai/summarize.ts).
 *
 * - Brief (summary-v2): the model first decides what kind of piece this is, then writes an
 *   overview and at most three sections chosen for that piece, plus the questions the brief
 *   leaves open (stored for the detailed summary, never shown).
 * - Detailed: the summary-v1 template (overview, key points, why it matters, quotes) until the
 *   detailed summary is rebuilt as a delta over the brief.
 * - Long documents: each chunk yields notes, and the brief or detailed prompt runs over the notes.
 */

import type { ContentItem } from "@/lib/types";
import type { SummaryOutput } from "@/lib/ai/types";

export type { SummaryOutput };

/** Prompt version recorded with every stored brief. */
export const BRIEF_SUMMARY_PROMPT_VERSION = "summary-v2";

/** What the model is given to summarize. */
export type SummarySource =
  | { kind: "full"; text: string }
  | { kind: "notes"; text: string }
  | { kind: "excerpt"; text: string }
  | { kind: "none" };

export function sourceFromItem(item: Pick<ContentItem, "fullContent" | "summary">): SummarySource {
  if (item.fullContent) return { kind: "full", text: item.fullContent };
  if (item.summary) return { kind: "excerpt", text: item.summary };
  return { kind: "none" };
}

function sourceSection(source: SummarySource): string {
  switch (source.kind) {
    case "full":
      return `## Full Content\n${source.text}`;
    case "notes":
      return `## Notes From Each Part Of A Long Document\nThe document was too long to read at once, so each part was reduced to notes, in order.\n\n${source.text}`;
    case "excerpt":
      return `## Available Summary\n${source.text}\n\n(Full content not available — summarize based on available metadata.)`;
    case "none":
      return "(Only title and metadata available — provide what insights you can from the title and source.)";
  }
}

function metadataSection(item: ContentItem): string {
  return `- **Title:** ${item.title}
- **Author:** ${item.author ?? "Unknown"}
- **Publication:** ${item.publication ?? "Unknown"}
- **Type:** ${item.contentType}
- **Topics:** ${item.topics.join(", ") || "None specified"}
${item.duration ? `- **Duration:** ${item.duration}` : ""}`;
}

/**
 * Shape hints: what a reader needs from each kind of piece. Guidance, not templates — the model
 * picks, renames, merges or drops sections to fit the piece in front of it.
 */
const SHAPE_HINTS = `| shape | what the reader needs |
|---|---|
| argument | the thesis, the main reasons, what the author concedes or dismisses |
| news | what happened, who and when, what changes and for whom |
| how-to | the goal, the steps in order, prerequisites and pitfalls |
| research | the question, the method in a line, the findings with numbers, the limits |
| conversation | who is speaking, the main claims by segment, memorable lines (interviews, podcasts, video transcripts) |
| meeting-note | decisions, action items with owners, open questions |
| product | what it does, how it differs, availability and cost |
| list | the items, each with a one-line reason it is on the list |
| other | whatever this particular piece is for |`;

const BRIEF_OUTPUT_SCHEMA = `{
  "shape": "one of: argument, news, how-to, research, conversation, meeting-note, product, list, other",
  "overview": "1-3 sentences",
  "sections": [
    { "heading": "a short heading written for this piece", "format": "bullets | steps | paragraph | quotes", "items": ["..."] }
  ],
  "openQuestions": ["a question the brief raises but does not answer", "..."]
}`;

/** The content-aware brief: an overview plus up to three sections chosen for this piece. */
export function briefSummaryPrompt(
  item: ContentItem,
  source: SummarySource = sourceFromItem(item)
): string {
  return `You write the brief summary for a personal reading library. The reader wants to know, in under a minute, what this piece is and what they would get from it. There is no fixed template: decide what this particular piece needs.

## Content to Summarize
${metadataSection(item)}

${sourceSection(source)}

## How to write the brief
1. Decide what kind of piece this is and set "shape". Use these hints for what a reader needs from each kind; they are guidance, not a required section list:
${SHAPE_HINTS}
2. Write "overview": 1-3 plain sentences that say what the piece is and its main point. No preamble such as "This article discusses".
3. Choose at most 3 "sections" that this piece actually needs, with headings written for this piece (for example "The three steps" or "What changes for developers", not "Key Points"). Use fewer sections when the piece is short or simple, and none when the overview says it all. Never include an empty or filler section.
   - "bullets" for separate points, "steps" for an ordered procedure, "paragraph" for one short passage (one item), "quotes" for exact lines from the content (only when the content is available).
   - At most 7 items across all sections. Each item is one sentence, concrete and specific: prefer the actual number, name or step over a vague description.
4. Write "openQuestions": 2-5 short questions this brief raises but does not answer, which the full piece does answer (for example "How did they measure the 40% gain?"). These are not shown; they guide a later, deeper summary.
5. Use only what is in the content and metadata. Do not add outside facts.

Output a JSON object with this exact structure. Output ONLY the JSON object, no other text:
${BRIEF_OUTPUT_SCHEMA}`;
}

const DETAILED_OUTPUT_SCHEMA = `{
  "overview": "2-3 sentence overview paragraph",
  "keyPoints": ["point 1", "point 2", "..."],
  "whyItMatters": "short paragraph on significance",
  "notableQuotes": ["optional quote 1", "optional quote 2"]
}`;

/** The detailed summary (summary-v1 template). */
export function detailedSummaryPrompt(
  item: ContentItem,
  source: SummarySource = sourceFromItem(item)
): string {
  return `You are a content summarizer for a personal information aggregator. Your job is to create clear, insightful summaries that help the reader quickly understand the key information.

## Content to Summarize
${metadataSection(item)}

${sourceSection(source)}

## Instructions
- overview: 2-3 sentence overview paragraph
- keyPoints (Key Points): array of 5-8 bullet points
- whyItMatters (Why This Matters): short paragraph on significance and implications
- notableQuotes (Notable Quotes): 1-3 key quotes if available in the content

Output a JSON object with this exact structure. Output ONLY the JSON object, no other text:
${DETAILED_OUTPUT_SCHEMA}`;
}

export function summarizePrompt(
  item: ContentItem,
  length: "brief" | "detailed",
  source: SummarySource = sourceFromItem(item)
): string {
  return length === "brief" ? briefSummaryPrompt(item, source) : detailedSummaryPrompt(item, source);
}

/** One part of a long document reduced to notes; the brief or detailed prompt runs over them. */
export function chunkNotesPrompt(chunk: string, chunkIndex: number, totalChunks: number): string {
  return `You are taking notes on part ${chunkIndex + 1} of ${totalChunks} of a longer document. A later step writes the summary from the notes of every part, so keep what a summary would need and drop the rest.

## Part Content
${chunk}

## Instructions
Write 3-12 notes. Each note is one sentence and keeps the specifics: claims and the reasons given for them, numbers, names, dates, steps in order, decisions, caveats, and at most two exact short quotes (in quotation marks). Do not describe the part ("this section talks about"); state what it says.

Output a JSON object with this exact structure. Output ONLY the JSON object, no other text:
{ "notes": ["note 1", "note 2", "..."] }`;
}
