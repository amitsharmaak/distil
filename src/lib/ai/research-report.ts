/**
 * The adaptive research report (R3): the outline a report is written from, the
 * per-section writer's output handling, and assembly into one markdown document.
 *
 * The outline stage produces a {@link ResearchOutline} (shape, TL;DR, key takeaways,
 * 3-6 sections with the findings and sources each draws on, caveats). One write
 * stage per section fills its body; assembly adds the fixed headings and runs no
 * model call. Everything here is pure; `research.ts` runs the stages.
 *
 * SERVER-SIDE ONLY.
 */

import { SchemaType, type ResponseSchema } from "@google/generative-ai";
import { z } from "zod";

import {
  RESEARCH_REPORT_SHAPES,
  RESEARCH_SECTION_FORMATS,
  type ResearchReportShape,
  type ResearchSectionFormat,
} from "@/lib/prompts/research";
import type { SourceCatalog } from "./research-sources";

export const MAX_REPORT_SECTIONS = 6;
export const MAX_TAKEAWAYS = 5;
export const MAX_CAVEATS = 4;
/** A section body shorter than this is treated as a failed write and retried. */
export const MIN_SECTION_WORDS = 60;
/** The TL;DR is trimmed to whole sentences within this many words on assembly. */
export const MAX_TLDR_WORDS = 60;
const MAX_HEADING_CHARS = 120;
const MAX_LINE_CHARS = 600;

export const TLDR_HEADING = "TL;DR";
export const TAKEAWAYS_HEADING = "Key takeaways";
export const CAVEATS_HEADING = "Caveats and open questions";

export interface ResearchOutlineSection {
  heading: string;
  purpose: string;
  /** Indices into the run's findings followed by its deepening answers. */
  findings: number[];
  /** Source catalog ids (`[n]` before renumbering) the section should cite. */
  sourceIds: number[];
  format: ResearchSectionFormat;
}

export interface ResearchOutline {
  shape: ResearchReportShape;
  tldr: string;
  takeaways: string[];
  sections: ResearchOutlineSection[];
  caveats: string[];
  /** True when the outline was built deterministically after the model's outline failed. */
  fallback?: boolean;
}

/** The notes of one finding as the outline and the section writer see them. */
export interface OutlineFinding {
  question: string;
  notes: string;
}

const FAILED_NOTES = /^\(Research on this (?:question|gap) failed\.\)$/;

/** A finding the search stage gave up on carries only a placeholder note. */
export function isUsableFinding(finding: OutlineFinding): boolean {
  return finding.notes.trim().length > 0 && !FAILED_NOTES.test(finding.notes.trim());
}

/** Gemini response schema for the outline (Anthropic ignores it; zod validates both). */
export const OUTLINE_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    shape: { type: SchemaType.STRING, format: "enum", enum: [...RESEARCH_REPORT_SHAPES] },
    tldr: { type: SchemaType.STRING },
    takeaways: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    sections: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          heading: { type: SchemaType.STRING },
          purpose: { type: SchemaType.STRING },
          findings: { type: SchemaType.ARRAY, items: { type: SchemaType.INTEGER } },
          sourceIds: { type: SchemaType.ARRAY, items: { type: SchemaType.INTEGER } },
          format: { type: SchemaType.STRING, format: "enum", enum: [...RESEARCH_SECTION_FORMATS] },
        },
        required: ["heading", "purpose", "findings", "sourceIds", "format"],
      },
    },
    caveats: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
  },
  required: ["shape", "tldr", "takeaways", "sections", "caveats"],
};

const idList = z
  .array(z.union([z.number(), z.string()]))
  .catch([])
  .transform((values) =>
    values
      .map((value) =>
        typeof value === "number" ? value : Number.parseInt(value.replace(/\D/g, ""), 10)
      )
      .filter((value) => Number.isInteger(value) && value > 0)
  );
const text = z.string().catch("");
const texts = z.array(z.unknown()).catch([]);

const rawOutlineSchema = z.object({
  shape: z.unknown(),
  tldr: z.string(),
  takeaways: texts,
  sections: z
    .array(
      z.object({
        heading: z.string(),
        purpose: text.optional(),
        findings: idList.optional(),
        sourceIds: idList.optional(),
        format: z.unknown(),
      })
    )
    .min(1),
  caveats: texts.optional(),
});

/** Thrown when the model's outline cannot be used; the stage retries, then falls back. */
export class InvalidOutlineError extends Error {
  constructor(readonly reason: "schema" | "tldr" | "sections" | "takeaways") {
    super(`research outline is not usable (${reason})`);
    this.name = "InvalidOutlineError";
  }
}

function oneLine(value: string, max = MAX_LINE_CHARS): string {
  const line = value.replace(/\s+/g, " ").trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > max / 2 ? space : max).trimEnd()}…`;
}

/** Heading text without markdown heading marks, emphasis or trailing punctuation. */
export function cleanHeading(value: string): string {
  const heading = value
    .replace(/^\s*#+\s*/, "")
    .replace(/[*_`]+/g, "")
    .replace(/[:.]+\s*$/, "");
  return oneLine(heading, MAX_HEADING_CHARS);
}

function cleanLines(values: unknown[], max: number): string[] {
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => oneLine(value.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")))
    .filter(Boolean)
    .slice(0, max);
}

const RESERVED_HEADINGS = new Set(
  [TLDR_HEADING, TAKEAWAYS_HEADING, CAVEATS_HEADING, "summary", "executive summary"].map(
    (heading) => heading.toLowerCase()
  )
);

/**
 * Validates and normalises the model's outline. Unknown shapes become `other` and unknown
 * formats `prose`; lists are trimmed to their caps; finding numbers (`F1` = 1-based position in
 * `usable`) map to run finding indices and unknown source ids are dropped. A section without a
 * valid finding draws on all usable findings. Throws {@link InvalidOutlineError} when there is no
 * TL;DR, no takeaway, or fewer sections than the findings allow (at least two when there are two
 * or more usable findings).
 */
export function parseOutline(
  value: unknown,
  usable: number[],
  catalog: SourceCatalog
): ResearchOutline {
  const parsed = rawOutlineSchema.safeParse(value);
  if (!parsed.success) throw new InvalidOutlineError("schema");
  const raw = parsed.data;
  const tldr = oneLine(raw.tldr, 1_200);
  if (!tldr) throw new InvalidOutlineError("tldr");
  const takeaways = cleanLines(raw.takeaways, MAX_TAKEAWAYS);
  if (takeaways.length === 0) throw new InvalidOutlineError("takeaways");
  const knownIds = new Set(catalog.sources.map((source) => source.id));
  const seenHeadings = new Set<string>();
  const sections: ResearchOutlineSection[] = [];
  for (const section of raw.sections) {
    const heading = cleanHeading(section.heading);
    const key = heading.toLowerCase();
    if (!heading || seenHeadings.has(key) || RESERVED_HEADINGS.has(key)) continue;
    seenHeadings.add(key);
    const findings = [
      ...new Set(
        (section.findings ?? [])
          .map((number) => usable[number - 1])
          .filter((index): index is number => index !== undefined)
      ),
    ];
    const format = RESEARCH_SECTION_FORMATS.find((candidate) => candidate === section.format);
    sections.push({
      heading,
      purpose: oneLine(section.purpose ?? ""),
      findings: findings.length > 0 ? findings : [...usable],
      sourceIds: [...new Set((section.sourceIds ?? []).filter((id) => knownIds.has(id)))],
      format: format ?? "prose",
    });
    if (sections.length >= MAX_REPORT_SECTIONS) break;
  }
  if (sections.length < Math.min(2, Math.max(1, usable.length))) {
    throw new InvalidOutlineError("sections");
  }
  const shape = RESEARCH_REPORT_SHAPES.find((candidate) => candidate === raw.shape) ?? "other";
  return {
    shape,
    tldr,
    takeaways,
    sections,
    caveats: cleanLines(raw.caveats ?? [], MAX_CAVEATS),
  };
}

/** First bullet (or first sentence) of a finding's notes, without list or emphasis marks. */
function firstFact(notes: string): string {
  for (const line of notes.split("\n")) {
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)/);
    if (bullet?.[1]) {
      const fact = oneLine(bullet[1].replace(/\*\*/g, ""), 300);
      if (fact.split(" ").length >= 4) return fact;
    }
  }
  const prose = notes
    .split("\n")
    .find((line) => line.trim() && !/^\s*#/.test(line) && line.trim().split(" ").length >= 4);
  return prose ? oneLine(prose.replace(/\*\*/g, ""), 300) : "";
}

function withCitation(sentence: string, ids: number[]): string {
  const marker = ids[0] === undefined ? "" : ` [${ids[0]}]`;
  const trimmed = sentence.replace(/[.;:,]+$/, "");
  return `${trimmed}${marker}.`;
}

/**
 * The outline used when the model's outline failed its attempts: one section per usable
 * finding in research order (deepening answers beyond the section cap join the last section),
 * a TL;DR and takeaways built from the findings' first facts, and a caveat saying so.
 */
export function fallbackOutline(
  findings: OutlineFinding[],
  catalog: SourceCatalog
): ResearchOutline {
  const usableIndices = findings.flatMap((finding, index) =>
    isUsableFinding(finding) ? [index] : []
  );
  const indices = usableIndices.length > 0 ? usableIndices : findings.map((_, index) => index);
  const sections: ResearchOutlineSection[] = [];
  const seen = new Set<string>();
  for (const index of indices) {
    const finding = findings[index]!;
    const heading = cleanHeading(finding.question) || `Research question ${index + 1}`;
    const last = sections.at(-1);
    if (last && (sections.length >= MAX_REPORT_SECTIONS || seen.has(heading.toLowerCase()))) {
      last.findings.push(index);
      last.sourceIds = [...new Set([...last.sourceIds, ...(catalog.idsByFinding[index] ?? [])])];
      continue;
    }
    seen.add(heading.toLowerCase());
    sections.push({
      heading,
      purpose: `Answer the research question: ${oneLine(finding.question, 300)}`,
      findings: [index],
      sourceIds: [...(catalog.idsByFinding[index] ?? [])],
      format: "prose",
    });
  }
  const facts = usableIndices
    .map((index) => ({ fact: firstFact(findings[index]!.notes), index }))
    .filter((entry) => entry.fact);
  const takeaways = facts
    .slice(0, MAX_TAKEAWAYS)
    .map(({ fact, index }) => withCitation(fact, catalog.idsByFinding[index] ?? []));
  const tldr =
    takeaways.slice(0, 2).join(" ") ||
    "The research could not establish specific findings for this question.";
  const failed = findings.length - usableIndices.length;
  const caveats = [
    "This report follows the research questions in order because its outline could not be planned automatically.",
    ...(failed > 0 && usableIndices.length > 0
      ? [
          `Research on ${failed} of ${findings.length} questions failed, so those parts of the question are not covered.`,
        ]
      : []),
  ];
  return { shape: "other", tldr, takeaways, sections, caveats, fallback: true };
}

/** Thrown when a section writer's answer is not a usable section body. */
export class IncompleteSectionError extends Error {
  constructor(readonly reason: "too_short") {
    super(`research section writer returned an incomplete section (${reason})`);
    this.name = "IncompleteSectionError";
  }
}

const FENCE = /^\s{0,3}(```|~~~)/;
const ATX = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const SOURCES_TRAILER = /^\s{0,3}(?:#{1,6}\s*)?\**\s*(?:sources|references)\s*\**:?\s*\**\s*$/i;

function comparable(value: string): string {
  return cleanHeading(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function countSectionWords(markdown: string): number {
  const words = markdown
    .replace(/\[\d+\]/g, " ")
    .replace(/[#>*_`|[\]-]+/g, " ")
    .match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu);
  return words ? words.length : 0;
}

/**
 * Normalises one section writer answer into a body that sits under the `## heading` assembly
 * adds: an outer ```markdown fence is unwrapped, a leading heading that repeats the section
 * heading (or any leading `#`/`##` heading) is dropped, remaining `#`/`##` headings are demoted to
 * `###`, and a trailing Sources/References block is removed. Throws
 * {@link IncompleteSectionError} when fewer than {@link MIN_SECTION_WORDS} words remain.
 */
export function cleanSectionBody(answer: string, heading: string): string {
  let body = answer.trim();
  const wrapped = body.match(/^```(?:markdown|md)?[ \t]*\n([\s\S]*?)\n```$/i);
  if (wrapped?.[1]) body = wrapped[1].trim();
  const lines = body.split("\n");
  while (lines.length > 0) {
    const first = lines[0]!;
    if (!first.trim()) {
      lines.shift();
      continue;
    }
    const match = first.match(ATX);
    const boldLine = first.match(/^\s*\*\*(.+?)\*\*:?\s*$/);
    const text = match?.[2] ?? boldLine?.[1];
    if (
      text !== undefined &&
      ((match && match[1]!.length <= 2) || comparable(text) === comparable(heading))
    ) {
      lines.shift();
      continue;
    }
    break;
  }
  let inFence = false;
  let trailerAt = -1;
  const out = lines.map((line, index) => {
    if (FENCE.test(line)) inFence = !inFence;
    if (inFence) return line;
    if (SOURCES_TRAILER.test(line) && trailerAt === -1) trailerAt = index;
    const match = line.match(ATX);
    if (match && match[1]!.length <= 2) return `### ${match[2]}`;
    return line;
  });
  const kept = trailerAt >= 0 ? out.slice(0, trailerAt) : out;
  const result = kept.join("\n").trim();
  if (countSectionWords(result) < MIN_SECTION_WORDS) throw new IncompleteSectionError("too_short");
  return result;
}

/** Body stored for a section whose write failed its attempts; its sources stay cited. */
export function sectionPlaceholder(sourceIds: number[]): string {
  const markers = sourceIds.map((id) => `[${id}]`).join("");
  return markers
    ? `*This section could not be written; see sources ${markers}.*`
    : "*This section could not be written.*";
}

export function isSectionPlaceholder(body: string): boolean {
  return body.startsWith("*This section could not be written");
}

/**
 * Keeps the TL;DR within {@link MAX_TLDR_WORDS} words (citation markers not counted): whole
 * sentences while they fit; a first sentence that is already too long is cut at the limit with
 * an ellipsis.
 */
export function limitTldr(tldr: string, maxWords = MAX_TLDR_WORDS): string {
  const text = tldr.replace(/\s+/g, " ").trim();
  if (countSectionWords(text) <= maxWords) return text;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept: string[] = [];
  for (const sentence of sentences) {
    if (countSectionWords([...kept, sentence].join(" ")) > maxWords) break;
    kept.push(sentence);
  }
  if (kept.length > 0) return kept.join(" ");
  const words = text.split(" ");
  let cut = "";
  for (let end = 1; end <= words.length; end++) {
    const candidate = words.slice(0, end).join(" ");
    if (countSectionWords(candidate) > maxWords) break;
    cut = candidate;
  }
  return `${cut.replace(/[,;:.]+$/, "")}…`;
}

/**
 * The report as stored: `## TL;DR`, `## Key takeaways`, one `##` per section, then
 * `## Caveats and open questions`. Citations still use catalog ids; the caller renumbers them.
 */
export function assembleReport(outline: ResearchOutline, sections: string[]): string {
  const parts = [`## ${TLDR_HEADING}`, limitTldr(outline.tldr)];
  if (outline.takeaways.length > 0) {
    parts.push(
      `## ${TAKEAWAYS_HEADING}`,
      outline.takeaways.map((takeaway) => `- ${takeaway}`).join("\n")
    );
  }
  outline.sections.forEach((section, index) => {
    parts.push(`## ${section.heading}`, sections[index] ?? sectionPlaceholder(section.sourceIds));
  });
  if (outline.caveats.length > 0) {
    parts.push(`## ${CAVEATS_HEADING}`, outline.caveats.map((caveat) => `- ${caveat}`).join("\n"));
  }
  return `${parts.join("\n\n")}\n`;
}
