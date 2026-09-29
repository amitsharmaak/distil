/**
 * AI summarization module.
 *
 * Generates markdown summaries for content items using the AI router.
 * Long content (over 8k estimated tokens) is reduced to notes per chunk first, and the
 * summary is written over the notes. Output is structured JSON rendered to markdown for
 * display; the JSON is stored alongside.
 *
 * - Brief (summary-v2): an overview plus sections chosen for the piece (BriefSummaryOutput),
 *   routed by size ("summarize" under 2k estimated tokens, "summarize-complex" above).
 * - Detailed (summary-v2): a delta over the stored brief (DetailedDeltaOutput), always on
 *   "summarize-complex". The stored markdown is the brief, a "Going deeper" divider and the
 *   delta sections, so the reader reads the brief once. A detailed row names the brief it was
 *   built from and is stale once that brief is regenerated (see summary-freshness.ts).
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
  DETAILED_SUMMARY_PROMPT_VERSION,
  briefSummaryPrompt,
  chunkNotesPrompt,
  detailedDeltaPrompt,
  type SummarySource,
} from "@/lib/prompts/summarize";
import { htmlToReadableText } from "@/lib/format";
import type { AuthContext } from "@/lib/contracts/tenant-context";
import type { RepositorySet, SummaryRecord } from "@/lib/repositories/ports";
import type { ContentItem } from "@/lib/types";
import { isDetailedCurrent } from "./summary-freshness";
import {
  SUMMARY_SECTION_FORMATS,
  SUMMARY_SHAPES,
  type BriefSummaryOutput,
  type DetailedDeltaOutput,
  type DetailedDeltaSection,
  type SummarySection,
} from "./types";

export type { BriefSummaryOutput, DetailedDeltaOutput };

/** Brief caps: the prompt asks for these; output beyond them is trimmed, not rejected. */
const BRIEF_MAX_SECTIONS = 3;
const BRIEF_MAX_ITEMS = 7;
const BRIEF_MAX_OPEN_QUESTIONS = 5;
/** Detailed caps: the prompt scales to the source; these only stop a runaway response. */
const DETAILED_MAX_SECTIONS = 8;
const DETAILED_MAX_ITEMS = 30;

/** The divider between the brief and the delta sections in a stored detailed summary. */
export const GOING_DEEPER_HEADING = "Going deeper";

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

const detailedDeltaSchema = z.object({
  sections: z.array(
    z.object({
      heading: z.string().trim().min(1),
      deepens: z
        .string()
        .optional()
        .catch(undefined)
        .transform((value) => value?.trim() || undefined),
      format: z.enum(SUMMARY_SECTION_FORMATS).catch("bullets"),
      items: nonEmptyStrings,
    })
  ),
});
const detailedDeltaResponseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    sections: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          heading: { type: SchemaType.STRING },
          deepens: { type: SchemaType.STRING },
          format: { type: SchemaType.STRING, format: "enum", enum: [...SUMMARY_SECTION_FORMATS] },
          items: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        },
        required: ["heading", "format", "items"],
      },
    },
  },
  required: ["sections"],
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

/** Keep sections with items, up to `maxSections` sections and `maxItems` items in total. */
function capSections<T extends SummarySection>(
  sections: T[],
  maxSections: number,
  maxItems: number
): T[] {
  let remaining = maxItems;
  const kept: T[] = [];
  for (const section of sections) {
    if (kept.length === maxSections || remaining === 0) break;
    const items = section.items.slice(0, section.format === "paragraph" ? 1 : remaining);
    if (items.length === 0) continue;
    remaining -= items.length;
    kept.push({ ...section, items });
  }
  return kept;
}

/** Trim a parsed brief to its caps: sections with items, at most 3 sections and 7 items. */
function capBrief(output: BriefSummaryOutput): BriefSummaryOutput {
  return {
    ...output,
    sections: capSections(output.sections, BRIEF_MAX_SECTIONS, BRIEF_MAX_ITEMS),
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

function renderSection(section: SummarySection, lead?: string): string | null {
  const items = section.items.map(cleanItem).filter(Boolean);
  if (items.length === 0) return null;
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
  return `## ${cleanHeading(section.heading)}\n\n${lead ? `${lead}\n\n` : ""}${body}`;
}

/** Convert a content-aware brief to markdown for storage/display. */
export function renderBriefSummaryMarkdown(output: BriefSummaryOutput): string {
  const blocks: string[] = [`## TL;DR\n\n${output.overview.trim()}`];
  for (const section of output.sections) {
    const block = renderSection(section);
    if (block) blocks.push(block);
  }
  return blocks.join("\n\n");
}

/** The "expands on" line under a delta section heading; the reader shows it as a caption. */
function deepensLine(deepens: string): string {
  return `_Expands on: ${deepens.replace(/\s+/g, " ").replace(/([\\_*])/g, "\\$1")}_`;
}

/**
 * Convert a detailed summary to markdown: the brief it was built from, a "Going deeper"
 * divider, then the delta sections, each with the brief point it expands.
 */
export function renderDetailedSummaryMarkdown(
  brief: BriefSummaryOutput,
  sections: DetailedDeltaSection[]
): string {
  const blocks = [renderBriefSummaryMarkdown(brief), `## ${GOING_DEEPER_HEADING}`];
  for (const section of sections) {
    const block = renderSection(
      section,
      section.deepens ? deepensLine(section.deepens) : undefined
    );
    if (block) blocks.push(block);
  }
  return blocks.join("\n\n");
}

/**
 * The text a summary is written from. Stored article content is reader HTML; markup would
 * reach the model and inflate the size estimate, so it is reduced to text with its paragraph,
 * heading and list structure kept.
 */
export function getSummarizableText(item: Pick<ContentItem, "fullContent" | "summary">): {
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
 * One structured model call: the prompt, the task it routes to, the Gemini response schema
 * and the zod schema the answer must satisfy. The generator uses the tenant router; the
 * evals pass their own.
 */
export type StructuredGenerate = <S extends z.ZodTypeAny>(
  prompt: string,
  task: AITask,
  responseSchema: ResponseSchema,
  schema: S
) => Promise<z.output<S>>;

/** What a summary prompt is written over, and the task a brief over it routes to. */
export interface PreparedSummarySource {
  source: SummarySource;
  briefTask: AITask;
}

/**
 * Size the text and, for long documents, reduce each chunk to notes (map step). The brief
 * and the detailed delta both run over the result, so one call prepares it once.
 */
export async function prepareSummarySource(
  text: string,
  source: SummarySource,
  generate: StructuredGenerate
): Promise<PreparedSummarySource> {
  const estimatedTokens = estimateTokens(text);
  if (estimatedTokens <= 8000) {
    return { source, briefTask: estimatedTokens >= 2000 ? "summarize-complex" : "summarize" };
  }
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
  return {
    source: {
      kind: "notes",
      text: chunkNotes
        .map(
          ({ notes }, index) => `### Part ${index + 1}\n${notes.map((n) => `- ${n}`).join("\n")}`
        )
        .join("\n\n"),
    },
    briefTask: "summarize-complex",
  };
}

/** Write the content-aware brief. */
export async function writeBrief(
  item: ContentItem,
  prepared: PreparedSummarySource,
  generate: StructuredGenerate
): Promise<BriefSummaryOutput> {
  return capBrief(
    await generate(
      briefSummaryPrompt(item, prepared.source),
      prepared.briefTask,
      briefResponseSchema,
      briefSummarySchema
    )
  );
}

/** Write the detailed delta over `brief`; always "summarize-complex", whatever the size. */
export async function writeDetailedDelta(
  item: ContentItem,
  prepared: PreparedSummarySource,
  brief: BriefSummaryOutput,
  generate: StructuredGenerate
): Promise<DetailedDeltaSection[]> {
  const output = await generate(
    detailedDeltaPrompt(item, brief, prepared.source),
    "summarize-complex",
    detailedDeltaResponseSchema,
    detailedDeltaSchema
  );
  const sections = capSections(
    output.sections.map(({ deepens, ...section }) => ({
      ...section,
      ...(deepens ? { deepens } : {}),
    })),
    DETAILED_MAX_SECTIONS,
    DETAILED_MAX_ITEMS
  );
  if (sections.length === 0) throw new AIProviderError("invalid_output");
  return sections;
}

/** The structured brief behind a stored row, when it is a summary-v2 brief. */
function storedBrief(record: SummaryRecord | undefined): BriefSummaryOutput | undefined {
  if (record?.promptVersion !== BRIEF_SUMMARY_PROMPT_VERSION) return undefined;
  const parsed = briefSummarySchema.safeParse(record.structured);
  return parsed.success ? parsed.data : undefined;
}

type SummaryLength = "brief" | "detailed";
type SummaryOptions = { length?: SummaryLength; force?: boolean };
export interface SummaryResult {
  summary: string;
  cached: boolean;
  /** Set when a detailed request had to (re)generate the brief first: the new brief markdown. */
  brief?: string;
}

/**
 * Generate an AI summary for a content item.
 *
 * Returns the cached summary if one exists (unless force=true, which still serves the cached
 * value for 60 s after it was written). A detailed summary is cached only while it belongs to
 * the stored brief.
 *
 * - Brief: "summarize" under 2k estimated tokens, "summarize-complex" up to 8k, and over 8k
 *   notes per chunk with "summarize", then the brief over the notes with "summarize-complex".
 * - Detailed: loads the stored summary-v2 brief, generating and storing it first when it is
 *   missing or a pre-S2 brief without structure, then writes the delta over it with
 *   "summarize-complex" (over the chunk notes for long documents).
 */
export function generateSummary(itemId: string, options?: SummaryOptions): Promise<SummaryResult>;
export function generateSummary(
  context: AuthContext,
  repositories: RepositorySet,
  itemId: string,
  options?: SummaryOptions
): Promise<SummaryResult>;
export async function generateSummary(
  contextOrItemId: AuthContext | string,
  repositoriesOrOptions?: RepositorySet | SummaryOptions,
  maybeItemId?: string,
  maybeOptions: SummaryOptions = {}
): Promise<SummaryResult> {
  if (typeof contextOrItemId === "string" || !maybeItemId) {
    throw new Error("Tenant context and repositories are required for summary generation");
  }
  const context = contextOrItemId;
  const repositories = repositoriesOrOptions as RepositorySet;
  const itemId = maybeItemId;
  const options = maybeOptions;
  const length = options.length ?? "brief";

  const [existing, existingBrief] = await Promise.all([
    repositories.summaries.find(itemId, length),
    length === "detailed" ? repositories.summaries.find(itemId, "brief") : undefined,
  ]);
  const usable =
    existing && (length === "brief" || isDetailedCurrent(existingBrief, existing))
      ? existing
      : undefined;
  if (!options.force && usable) {
    return { summary: usable.summary, cached: true };
  }
  if (
    options.force &&
    usable &&
    Date.now() - new Date(usable.createdAt).getTime() < FORCE_COOLDOWN_MS
  ) {
    return { summary: usable.summary, cached: true };
  }

  const item = await repositories.items.findById(itemId);
  if (!item) {
    throw new Error(`Item not found: ${itemId}`);
  }

  const { source, text } = getSummarizableText(item);

  let model = "";
  const ai = createTenantAIRouter(context, repositories);
  const generate: StructuredGenerate = async (prompt, task, responseSchema, schema) => {
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
    return parsed.data;
  };

  const prepared = await prepareSummarySource(text, source, generate);
  const hash = contentHash(text);

  async function storeBrief(): Promise<{ id: string; brief: BriefSummaryOutput; summary: string }> {
    const brief = await writeBrief(item!, prepared, generate);
    const summary = renderBriefSummaryMarkdown(brief);
    const id = crypto.randomUUID();
    await repositories.summaries.upsert({
      id,
      itemId,
      summary,
      model,
      promptType: "brief",
      structured: brief,
      promptVersion: BRIEF_SUMMARY_PROMPT_VERSION,
      contentHash: hash,
    });
    return { id, brief, summary };
  }

  if (length === "brief") {
    const { summary } = await storeBrief();
    return { summary, cached: false };
  }

  // Detailed: the delta is written over the stored brief. The brief is stored before the
  // delta call, so a retry after a timeout only has the delta left to do.
  const reused = storedBrief(existingBrief);
  const base =
    reused && existingBrief
      ? { id: existingBrief.id, brief: reused, summary: undefined }
      : await storeBrief();
  const sections = await writeDetailedDelta(item, prepared, base.brief, generate);
  const summary = renderDetailedSummaryMarkdown(base.brief, sections);
  const structured: DetailedDeltaOutput = { briefId: base.id, sections };
  await repositories.summaries.upsert({
    id: crypto.randomUUID(),
    itemId,
    summary,
    model,
    promptType: "detailed",
    structured,
    promptVersion: DETAILED_SUMMARY_PROMPT_VERSION,
    contentHash: hash,
  });
  return { summary, cached: false, ...(base.summary ? { brief: base.summary } : {}) };
}
