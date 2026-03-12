/**
 * Stage 1 of the Unified Intelligence Layer — Content Classification.
 *
 * Uses Gemini to classify raw content (email category, content type,
 * media types, language, confidence, isContentPage).
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import type { RawContent, ContentClassification, MediaType } from "./types";
import type { ContentType } from "../types";
import { classifyContentPrompt } from "@/lib/prompts/intelligence";
import { generateText, FAST_MODEL } from "../ai/client";

const VALID_CONTENT_TYPES: ContentType[] = ["article", "video", "podcast"];
const VALID_MEDIA_TYPES: MediaType[] = [
  "text",
  "images",
  "embedded-video",
  "embedded-audio",
  "interactive",
  "pdf",
];

function stripMarkdownFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function safeDefaultClassification(): ContentClassification {
  return {
    contentType: "article",
    detectedMediaTypes: ["text"],
    language: "en",
    confidence: 0,
    isContentPage: true,
    classifiedAt: new Date().toISOString(),
  };
}

export async function classify(raw: RawContent): Promise<ContentClassification> {
  const prompt = classifyContentPrompt({
    rawBody: raw.rawBody,
    metadata: { ...raw.metadata, sourceType: raw.sourceType } as Record<string, unknown>,
    url: raw.url,
  });

  let response: string;
  try {
    response = await generateText(prompt, FAST_MODEL);
  } catch {
    return safeDefaultClassification();
  }

  const cleaned = stripMarkdownFences(response);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return safeDefaultClassification();
  }

  const contentType = VALID_CONTENT_TYPES.includes(parsed.contentType as ContentType)
    ? (parsed.contentType as ContentType)
    : "article";

  const rawMedia = Array.isArray(parsed.detectedMediaTypes)
    ? (parsed.detectedMediaTypes as string[])
    : [];
  const detectedMediaTypes = rawMedia.filter((m): m is MediaType =>
    VALID_MEDIA_TYPES.includes(m as MediaType),
  );
  if (detectedMediaTypes.length === 0) detectedMediaTypes.push("text");

  const confidence = typeof parsed.confidence === "number"
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0;

  const isContentPage =
    typeof parsed.isContentPage === "boolean" ? parsed.isContentPage : true;

  const language =
    typeof parsed.language === "string" && parsed.language.length > 0
      ? parsed.language
      : "en";

  const result: ContentClassification = {
    contentType,
    detectedMediaTypes,
    language,
    confidence,
    isContentPage,
    classifiedAt: new Date().toISOString(),
  };

  if (raw.sourceType === "gmail" && parsed.emailCategory != null) {
    const validCategories = [
      "newsletter",
      "digest",
      "transactional",
      "personal",
      "promotional",
      "notification",
      "automated",
      "announcement",
      "unknown",
    ];
    if (validCategories.includes(String(parsed.emailCategory))) {
      result.emailCategory = parsed.emailCategory as ContentClassification["emailCategory"];
    }
  }

  return result;
}
