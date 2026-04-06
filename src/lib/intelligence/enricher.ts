/**
 * Stage 5: Content Enricher — final enrichment to produce feed-ready data.
 *
 * AI summary, topic extraction, and heuristic priority scoring.
 *
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import { generateText } from "@/lib/ai/router";
import { enrichSummaryPrompt, enrichTopicsPrompt } from "@/lib/prompts/intelligence";
import { detectStrategy } from "@/lib/content-strategies";
import type { Priority } from "@/lib/types";
import type {
  ContentAnalysis,
  ContentClassification,
  EnrichedContent,
  ExtractedContentResult,
  RawContent,
} from "./types";


/**
 * Enriches content with AI summary, topics, and priority score.
 */
export async function enrichContent(
  raw: RawContent,
  extracted: ExtractedContentResult,
  analysis: ContentAnalysis,
  classification: ContentClassification,
): Promise<EnrichedContent> {
  const cleanText = extracted.cleanTextContent ?? "";
  const title = extracted.title ?? "Untitled";

  const strategy = detectStrategy(raw.url ?? "");

  let summary: string;
  let topics: string[] = [];

  if (!strategy.generateAISummary) {
    // For content types that don't warrant AI summarization (e.g. tweets),
    // use the extracted text directly so items.summary holds the real content.
    // summaryMaxChars is a display-only limit — do not truncate storage here.
    summary = cleanText || title;
  } else {
    try {
      summary = (await generateText(enrichSummaryPrompt(title, cleanText), "summarize")).trim();
      if (!summary) throw new Error("Empty summary");
    } catch {
      summary = cleanText.slice(0, 200) + (cleanText.length > 200 ? "..." : "");
    }
  }

  try {
    const topicsResponse = (await generateText(enrichTopicsPrompt(title, cleanText), "auto-tag")).trim();
    const parsed = parseTopicsJson(topicsResponse);
    topics = Array.isArray(parsed) ? parsed : [];
  } catch {
    topics = [];
  }

  const priorityScore = computePriorityScore(
    raw,
    extracted,
    analysis,
    classification,
  );
  const priority = scoreToPriority(priorityScore);

  return {
    summary,
    topics,
    priorityScore,
    priority,
  };
}

function computePriorityScore(
  raw: RawContent,
  _extracted: ExtractedContentResult,
  analysis: ContentAnalysis,
  classification: ContentClassification,
): number {
  let score = 50;

  if (analysis.informationDensityScore > 0.7) score += 15;
  if (analysis.wordCount > 500) score += 10;
  if (
    classification.emailCategory === "newsletter" ||
    classification.emailCategory === "digest"
  ) {
    score += 10;
  }
  if (classification.contentType === "article") score += 5;
  if (analysis.detectedMedia.length > 0) score += 5;
  if (raw.sourceType === "gmail") score += 5;

  return Math.min(100, score);
}

function scoreToPriority(score: number): Priority {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function parseTopicsJson(text: string): string[] {
  const trimmed = text.trim();
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return [];

  try {
    const parsed = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string")
      .map((s) => String(s).toLowerCase().trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}
