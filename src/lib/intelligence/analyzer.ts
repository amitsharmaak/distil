/**
 * Stage 4: Content Analyzer — deep analysis of extracted content.
 *
 * Media detection (deterministic) + AI analysis (links, entities, density).
 *
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import { generateText } from "@/lib/ai/client";
import type { ExtractedLink } from "@/lib/types";
import { analyzeContentPrompt } from "@/lib/prompts/intelligence";
import type {
  ContentAnalysis,
  ContentClassification,
  DetectedMedia,
  ExtractedContentResult,
  RawContent,
} from "./types";

// Media detection patterns
const YOUTUBE_PATTERNS = [
  /youtube\.com\/embed\//i,
  /youtube\.com\/watch\?v=/i,
  /youtu\.be\//i,
];
const VIMEO_PATTERN = /vimeo\.com\//i;
const SPOTIFY_EPISODE_PATTERN = /open\.spotify\.com\/episode/i;
const SPOTIFY_SHOW_PATTERN = /open\.spotify\.com\/show/i;
const APPLE_PODCASTS_PATTERN = /podcasts\.apple\.com/i;

interface AIAnalysisResponse {
  relevantLinks?: Array<{
    url: string;
    title?: string;
    relevance?: string;
    context?: string;
  }>;
  entities?: Array<{ name: string; type: string }>;
  informationDensityScore?: number;
}

/**
 * Analyzes extracted content: detects media, runs AI analysis, computes word count.
 */
export async function analyzeContent(
  raw: RawContent,
  extracted: ExtractedContentResult,
  classification: ContentClassification,
): Promise<ContentAnalysis> {
  const detectedMedia = detectMedia(extracted);
  const cleanText = extracted.cleanTextContent ?? "";
  const wordCount = cleanText.split(/\s+/).filter(Boolean).length;
  const estimatedReadTimeMinutes = Math.ceil(wordCount / 200);

  let relevantLinks: ExtractedLink[] = [];
  let entities: ContentAnalysis["entities"] = [];
  let informationDensityScore = 0.5;

  try {
    const prompt = analyzeContentPrompt({
      cleanContent: extracted.cleanContent,
      allLinks: extracted.allLinks.map((l) => ({
        url: l.url,
        anchorText: l.anchorText,
        surroundingContext: l.surroundingContext,
      })),
    });
    const response = await generateText(prompt);
    const parsed = parseAnalysisResponse(response);

    relevantLinks = (parsed.relevantLinks ?? [])
      .filter(
        (l) =>
          l.relevance === "high" || l.relevance === "medium",
      )
      .map((l) => ({
        url: l.url,
        text: l.title ?? l.url,
      }));

    entities = (parsed.entities ?? [])
      .filter((e) =>
        ["person", "company", "technology", "topic", "place"].includes(e.type),
      )
      .map((e) => ({
        name: e.name,
        type: e.type as ContentAnalysis["entities"][0]["type"],
      }));

    if (typeof parsed.informationDensityScore === "number") {
      informationDensityScore = Math.max(
        0,
        Math.min(1, parsed.informationDensityScore),
      );
    }
  } catch {
    // Use defaults on AI failure
  }

  return {
    detectedMedia,
    relevantLinks,
    entities,
    wordCount,
    estimatedReadTimeMinutes,
    informationDensityScore,
  };
}

function detectMedia(extracted: ExtractedContentResult): DetectedMedia[] {
  const media: DetectedMedia[] = [];
  const content = extracted.cleanContent ?? "";
  const lower = content.toLowerCase();

  // YouTube
  if (YOUTUBE_PATTERNS.some((p) => p.test(content))) {
    media.push({ type: "video", platform: "youtube" });
  }

  // Vimeo (in iframes)
  if (VIMEO_PATTERN.test(content) && /iframe/i.test(content)) {
    media.push({ type: "video", platform: "vimeo" });
  }

  // Spotify
  if (SPOTIFY_EPISODE_PATTERN.test(content) || SPOTIFY_SHOW_PATTERN.test(content)) {
    media.push({ type: "audio", platform: "spotify" });
  }

  // Apple Podcasts
  if (APPLE_PODCASTS_PATTERN.test(content)) {
    media.push({ type: "audio", platform: "apple-podcasts" });
  }

  // Native audio/video tags
  if (/<audio\s/i.test(content)) {
    media.push({ type: "audio" });
  }
  if (/<video\s/i.test(content)) {
    media.push({ type: "video" });
  }

  // Images
  const imgCount = (lower.match(/<img\s/g) ?? []).length;
  if (extracted.thumbnailUrl || imgCount > 2) {
    media.push({ type: "image" });
  }

  return media;
}

function parseAnalysisResponse(text: string): AIAnalysisResponse {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return {};

  try {
    return JSON.parse(jsonMatch[0]) as AIAnalysisResponse;
  } catch {
    return {};
  }
}
