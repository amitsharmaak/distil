/**
 * Stage 3: Content Extractor — extracts clean content from raw input.
 *
 * For URL-based content: uses Readability (via content-extractor) + OG metadata.
 * For email content: extracts from raw email body and metadata.
 *
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import {
  extractContent as extractPageContent,
  type ExtractedLink as ContentExtractorLink,
} from "@/lib/content-extractor";
import { fetchOG } from "@/lib/og";
import type {
  ContentClassification,
  ExtractedContentResult,
  RawContent,
  RawExtractedLink,
} from "./types";

const HREF_REGEX = /href="(https?:\/\/[^"]+)"/gi;

/**
 * Extracts clean content from raw input based on source type and classification.
 */
export async function extractContent(
  raw: RawContent,
  classification: ContentClassification,
): Promise<ExtractedContentResult> {
  try {
    // URL-based content (including Slack with a linked URL)
    if (raw.url) {
      return extractFromUrl(raw);
    }

    // Email content
    if (raw.sourceType === "gmail") {
      return extractFromEmail(raw);
    }

    // Fallback: minimal result from metadata
    return minimalResult(raw);
  } catch {
    return minimalResult(raw);
  }
}

async function extractFromUrl(raw: RawContent): Promise<ExtractedContentResult> {
  const url = raw.url!;

  const [readabilityResult, ogData] = await Promise.all([
    extractPageContent(url),
    fetchOG(url),
  ]);

  if (!readabilityResult) {
    // Readability is intentionally skipped for some URLs (e.g. Twitter/X).
    // Fall back to OG description, which for Twitter contains the full tweet
    // text fetched via fxtwitter.
    const fallbackText = ogData.description ?? "";
    return {
      cleanContent: fallbackText,
      cleanTextContent: fallbackText,
      title: ogData.title ?? raw.metadata.pageTitle ?? "Untitled",
      author: ogData.author ?? undefined,
      publication: ogData.siteName ?? undefined,
      thumbnailUrl: ogData.image ?? undefined,
      videoUrl: ogData.videoUrl ?? undefined,
      allLinks: [],
    };
  }

  const allLinks: RawExtractedLink[] = readabilityResult.extractedLinks.map(
    (link: ContentExtractorLink) => ({
      url: link.url,
      anchorText: link.text || undefined,
    }),
  );

  return {
    cleanContent: readabilityResult.content,
    cleanTextContent: readabilityResult.textContent,
    title:
      ogData.title ??
      readabilityResult.title ??
      raw.metadata.pageTitle ??
      "Untitled",
    author: readabilityResult.byline ?? ogData.author ?? undefined,
    publication: ogData.siteName ?? undefined,
    thumbnailUrl: ogData.image ?? undefined,
    allLinks,
  };
}

function extractFromEmail(raw: RawContent): ExtractedContentResult {
  const html = raw.rawBody ?? "";
  const text = raw.rawTextContent ?? raw.rawBody ?? "";

  // Extract links from HTML
  const linkMatches = [...html.matchAll(HREF_REGEX)];
  const seen = new Set<string>();
  const allLinks: RawExtractedLink[] = [];
  for (const m of linkMatches) {
    const url = m[1];
    if (url && !seen.has(url)) {
      seen.add(url);
      allLinks.push({ url });
    }
  }

  // "View in browser" link — first https URL in first 3000 chars
  const first3k = html.slice(0, 3000);
  const viewMatch = first3k.match(/https?:\/\/[^\s"']+/);
  if (viewMatch && !seen.has(viewMatch[0])) {
    allLinks.unshift({ url: viewMatch[0], anchorText: "View in browser" });
  }

  const cleanContent = text || html;

  return {
    cleanContent,
    cleanTextContent: cleanContent,
    title: raw.metadata.subject ?? "Untitled",
    author: raw.metadata.authorName ?? undefined,
    publication: raw.metadata.senderDomain ?? undefined,
    allLinks,
  };
}

function minimalResult(raw: RawContent): ExtractedContentResult {
  const text = raw.rawTextContent ?? raw.rawBody ?? "";
  return {
    cleanContent: text,
    cleanTextContent: text,
    title: raw.metadata.pageTitle ?? raw.metadata.subject ?? "Untitled",
    author: raw.metadata.authorName ?? undefined,
    publication: raw.metadata.senderDomain ?? undefined,
    allLinks: [],
  };
}
