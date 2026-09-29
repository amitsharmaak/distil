/**
 * AI summarization module.
 *
 * Generates markdown summaries for content items using the AI router.
 * Uses content-length-aware routing: short content → single summarize call,
 * long content → map-reduce (notes per chunk, then one summary over the notes).
 * Output is structured JSON rendered to markdown for display; the JSON is stored alongside.
 *
 * - Brief (summary-v2): an overview plus sections chosen for the piece (BriefSummaryOutput).
 * - Detailed (summary-v1): overview, key points, why it matters, quotes (SummaryOutput).
 *
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import crypto from "crypto";
import { createTenantAIRouter } from "./router";
import { SchemaType, type ResponseSchema } from "@google/generative-ai";
import { z } from "zod";
import pLimit from "p-limit";
import { AIProviderError } from "./errors";
import type { AITask } from "./ai-config";
import {
  BRIEF_SUMMARY_PROMPT_VERSION,
  briefSummaryPrompt,
  chunkNotesPrompt,
  detailedSummaryPrompt,
  type SummarySource,
} from "@/lib/prompts/summarize";
import { htmlToReadableText } from "@/lib/format";
import type { AuthContext } from "@/lib/contracts/tenant-context";
import type { RepositorySet } from "@/lib/repositories/ports";
import type { ContentItem } from "@/lib/types";
import {
  SUMMARY_SECTION_FORMATS,
  SUMMARY_SHAPES,
  type BriefSummaryOutput,
  type SummaryOutput,
} from "./types";

export type { BriefSummaryOutput, SummaryOutput };

export const DETAILED_SUMMARY_PROMPT_VERSION = "summary-v1";

/** Brief caps: the prompt asks for these; output beyond them is trimmed, not rejected. */
const BRIEF_MAX_SECTIONS = 3;
const BRIEF_MAX_ITEMS = 7;
const BRIEF_MAX_OPEN_QUESTIONS = 5;

const nonEmptyStrings = z
  .array(z.string())
  .transform((values) => values.map((value) => value.trim()).filter(Boolean));

const briefSummarySchema = z.object({
  shape: z.enum(SUMMARY_SHAPES).catch("other"),
  overview: z.string().trim().min(1),
  sections: z
    .array(
      z.object({
        heading: z.string().trim().min(1),
        format: z.enum(SUMMARY_SECTION_FORMATS).catch("bullets"),
        items: nonEmptyStrings,
      })
    )
    .default([]),
  openQuestions: nonEmptyStrings.default([]),
});
const briefResponseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    shape: { type: SchemaType.STRING, format: "enum", enum: [...SUMMARY_SHAPES] },
    overview: { type: SchemaType.STRING },
    sections: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          heading: { type: SchemaType.STRING },
          format: { type: SchemaType.STRING, format: "enum", enum: [...SUMMARY_SECTION_FORMATS] },
          items: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        },
        required: ["heading", "format", "items"],
      },
    },
    openQuestions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
  },
  required: ["shape", "overview", "sections", "openQuestions"],
};

const detailedSummarySchema = z.object({
  overview: z.string().trim().min(1),
  keyPoints: z.array(z.string().trim().min(1)).min(1),
  whyItMatters: z.string().optional(),
  notableQuotes: z.array(z.string()).optional(),
});
const detailedResponseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    overview: { type: SchemaType.STRING },
    keyPoints: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    whyItMatters: { type: SchemaType.STRING },
    notableQuotes: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
  },
  required: ["overview", "keyPoints"],
};

const chunkNotesSchema = z.object({ notes: nonEmptyStrings.pipe(z.array(z.string()).min(1)) });
const chunkNotesResponseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: { notes: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } } },
  required: ["notes"],
};

const FORCE_COOLDOWN_MS = 60_000;

/** Estimate token count as ~4 chars per token. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Split content into ~targetTokenCount chunks at paragraph boundaries. */
function splitIntoChunks(content: string, targetTokenCount: number): string[] {
  const paragraphs = content.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const p of paragraphs) {
    const candidate = current ? `${current}\n\n${p}` : p;
    if (estimateTokens(candidate) <= targetTokenCount) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      current = p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Trim a parsed brief to its caps: sections with items, at most 3 sections and 7 items. */
function capBrief(output: BriefSummaryOutput): BriefSummaryOutput {
  let remaining = BRIEF_MAX_ITEMS;
  const sections: BriefSummaryOutput["sections"] = [];
  for (const section of output.sections) {
    if (sections.length === BRIEF_MAX_SECTIONS || remaining === 0) break;
    const items = section.items.slice(0, section.format === "paragraph" ? 1 : remaining);
    if (items.length === 0) continue;
    remaining -= items.length;
    sections.push({ ...section, items });
  }
  return {
    ...output,
    sections,
    openQuestions: output.openQuestions.slice(0, BRIEF_MAX_OPEN_QUESTIONS),
  };
}

/** Model output sometimes carries its own list marker or heading syntax; the renderer adds them. */
function cleanItem(value: string): string {
  return value.replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, "").trim();
}

function cleanHeading(value: string): string {
  return value
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Convert a content-aware brief to markdown for storage/display. */
export function renderBriefSummaryMarkdown(output: BriefSummaryOutput): string {
  const blocks: string[] = [`## TL;DR\n\n${output.overview.trim()}`];
  for (const section of output.sections) {
    const items = section.items.map(cleanItem).filter(Boolean);
    if (items.length === 0) continue;
    let body: string;
    switch (section.format) {
      case "steps":
        body = items.map((item, index) => `${index + 1}. ${item}`).join("\n");
        break;
      case "paragraph":
        body = items.join("\n\n");
        break;
      case "quotes":
        body = items.map((item) => `> ${item.replace(/\n+/g, " ")}`).join("\n\n");
        break;
      default:
        body = items.map((item) => `- ${item}`).join("\n");
    }
    blocks.push(`## ${cleanHeading(section.heading)}\n\n${body}`);
  }
  return blocks.join("\n\n");
}

/** Convert a detailed SummaryOutput to markdown for storage/display. */
export function renderSummaryMarkdown(output: SummaryOutput): string {
  const lines: string[] = [];

  lines.push("## TL;DR");
  lines.push("");
  lines.push(output.overview);
  lines.push("");
  lines.push("## Key Points");
  lines.push("");
  for (const point of output.keyPoints) {
    lines.push(`- ${point}`);
  }

  if (output.whyItMatters?.trim()) {
    lines.push("");
    lines.push("## Why This Matters");
    lines.push("");
    lines.push(output.whyItMatters);
  }

  if (output.notableQuotes && output.notableQuotes.length > 0) {
    lines.push("");
    lines.push("## Notable Quotes");
    lines.push("");
    for (const quote of output.notableQuotes) {
      lines.push(`- ${quote}`);
    }
  }

  return lines.join("\n");
}

/**
 * The text a summary is written from. Stored article content is reader HTML; markup would
 * reach the model and inflate the size estimate, so it is reduced to text with its paragraph,
 * heading and list structure kept.
 */
function getSummarizableText(item: Pick<ContentItem, "fullContent" | "summary">): {
  source: SummarySource;
  text: string;
} {
  if (item.fullContent) {
    const text = /<[a-z][^>]*>/i.test(item.fullContent)
      ? htmlToReadableText(item.fullContent)
      : item.fullContent.trim();
    if (text) return { source: { kind: "full", text }, text };
  }
  if (item.summary) return { source: { kind: "excerpt", text: item.summary }, text: item.summary };
  return { source: { kind: "none" }, text: "" };
}

function contentHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/**
 * Generate an AI summary for a content item.
 *
 * Returns the cached summary if one exists (unless force=true).
 * Otherwise calls the AI router to generate a new one and stores it.
 *
 * - Short content (<2000 tokens): single "summarize" call
 * - Medium content (2000–8000 tokens): single "summarize-complex" call
 * - Long content (>8000 tokens): map-reduce (notes per chunk with "summarize", then the
 *   requested brief or detailed prompt over the notes with "summarize-complex")
 */
export function generateSummary(
  itemId: string,
  options?: { length?: "brief" | "detailed"; force?: boolean }
): Promise<{ summary: string; cached: boolean }>;
export function generateSummary(
  context: AuthContext,
  repositories: RepositorySet,
  itemId: string,
  options?: { length?: "brief" | "detailed"; force?: boolean }
): Promise<{ summary: string; cached: boolean }>;
export async function generateSummary(
  contextOrItemId: AuthContext | string,
  repositoriesOrOptions?: RepositorySet | { length?: "brief" | "detailed"; force?: boolean },
  maybeItemId?: string,
  maybeOptions: { length?: "brief" | "detailed"; force?: boolean } = {}
): Promise<{ summary: string; cached: boolean }> {
  if (typeof contextOrItemId === "string" || !maybeItemId) {
    throw new Error("Tenant context and repositories are required for summary generation");
  }
  const context = contextOrItemId;
  const repositories = repositoriesOrOptions as RepositorySet;
  const itemId = maybeItemId;
  const options = maybeOptions;
  const length = options.length ?? "brief";

  const existing = await repositories.summaries.find(itemId, length);
  if (!options.force && existing) {
    return { summary: existing.summary, cached: true };
  }
  const now = Date.now();
  if (
    options.force &&
    existing &&
    now - new Date(existing.createdAt).getTime() < FORCE_COOLDOWN_MS
  ) {
    return { summary: existing.summary, cached: true };
  }

  const item = await repositories.items.findById(itemId);
  if (!item) {
    throw new Error(`Item not found: ${itemId}`);
  }

  const { source, text } = getSummarizableText(item);
  const estimatedTokens = estimateTokens(text);

  let model = "";
  const ai = createTenantAIRouter(context, repositories);
  async function generate<S extends z.ZodTypeAny>(
    prompt: string,
    task: AITask,
    responseSchema: ResponseSchema,
    schema: S
  ): Promise<z.output<S>> {
    const result = await ai.generateJSONWithMetadata<unknown>(prompt, task, {
      responseSchema,
      // Long inputs on thinking models (video transcripts) need more than the
      // default; the calling routes allow up to 60 s.
      timeoutMs: task === "summarize-complex" ? 40_000 : 15_000,
      maxAttempts: 1,
    });
    const parsed = schema.safeParse(result.value);
    if (!parsed.success) throw new AIProviderError("invalid_output", result.provider, result.model);
    model = result.model;
    return parsed.data as z.output<S>;
  }

  let promptSource = source;
  let task: AITask = estimatedTokens >= 2000 ? "summarize-complex" : "summarize";
  if (estimatedTokens > 8000) {
    // Map-reduce: notes per chunk → the requested summary over the notes.
    const CHUNK_TARGET = 4000;
    const chunks = splitIntoChunks(text, CHUNK_TARGET);

    const limit = pLimit(3);
    const chunkNotes = await Promise.all(
      chunks.map((chunk, index) =>
        limit(() =>
          generate(
            chunkNotesPrompt(chunk, index, chunks.length),
            "summarize",
            chunkNotesResponseSchema,
            chunkNotesSchema
          )
        )
      )
    );
    promptSource = {
      kind: "notes",
      text: chunkNotes
        .map(
          ({ notes }, index) => `### Part ${index + 1}\n${notes.map((n) => `- ${n}`).join("\n")}`
        )
        .join("\n\n"),
    };
    task = "summarize-complex";
  }

  let summary: string;
  let structured: BriefSummaryOutput | SummaryOutput;
  let promptVersion: string;
  if (length === "brief") {
    const brief = capBrief(
      await generate(
        briefSummaryPrompt(item, promptSource),
        task,
        briefResponseSchema,
        briefSummarySchema
      )
    );
    summary = renderBriefSummaryMarkdown(brief);
    structured = brief;
    promptVersion = BRIEF_SUMMARY_PROMPT_VERSION;
  } else {
    const detailed = await generate(
      detailedSummaryPrompt(item, promptSource),
      task,
      detailedResponseSchema,
      detailedSummarySchema
    );
    summary = renderSummaryMarkdown(detailed);
    structured = detailed;
    promptVersion = DETAILED_SUMMARY_PROMPT_VERSION;
  }

  await repositories.summaries.upsert({
    id: crypto.randomUUID(),
    itemId,
    summary,
    model,
    promptType: length,
    structured,
    promptVersion,
    contentHash: contentHash(text),
  });
  return { summary, cached: false };
}
