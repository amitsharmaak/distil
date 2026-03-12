/**
 * Prompt templates for the Unified Intelligence Layer pipeline.
 *
 * Used by:
 *   Stage 1 — src/lib/intelligence/classifier.ts   (classifyContentPrompt)
 *   Stage 3 — src/lib/intelligence/extractor.ts    (extractContentPrompt)
 *   Stage 4 — src/lib/intelligence/analyzer.ts     (analyzeContentPrompt)
 *   Stage 5 — src/lib/intelligence/enricher.ts     (enrichSummaryPrompt, enrichTopicsPrompt)
 */

const TRUNCATE_LEN = {
  rawBody: 3000,
  readabilityOutput: 6000,
  cleanContent: 5000,
  enrichSummary: 3000,
  enrichTopics: 2000,
} as const;

const MAX_LINKS = 30;
const MAX_RELEVANT_LINKS = 10;

// ── Stage 1: Content Classification ───────────────────────────────────────────

export function classifyContentPrompt(input: {
  rawBody: string;
  metadata: Record<string, unknown>;
  url?: string;
}): string {
  const truncated = input.rawBody.slice(0, TRUNCATE_LEN.rawBody);
  const metadataStr = JSON.stringify(input.metadata, null, 2);
  const urlSection = input.url ? `\n- **URL:** ${input.url}` : "";

  return `You are a content classifier for a personal information aggregator. Classify the following content into a structured JSON schema.

## Content to Classify
${urlSection}
- **Metadata:** ${metadataStr}

## Raw Content (truncated)
${truncated}

## Instructions
Analyze the content and respond with a valid JSON object matching this exact schema. Output ONLY the JSON object, no markdown fences, no backticks, no extra text.

Schema:
{
  "emailCategory": "newsletter|digest|transactional|personal|promotional|notification|automated|announcement|unknown",
  "contentType": "article|video|podcast",
  "detectedMediaTypes": ["text", "images", "embedded-video", "embedded-audio", "interactive", "pdf"],
  "language": "en",
  "confidence": 0.95,
  "isContentPage": true
}

Field rules:
- **emailCategory**: Only include when metadata.sourceType is "gmail". Use "unknown" if unsure. Omit or set to null when the source is NOT email.
- **contentType**: Primary type: "article" (written), "video" (video content), "podcast" (audio content).
- **detectedMediaTypes**: Array of media present. Use only: "text", "images", "embedded-video", "embedded-audio", "interactive", "pdf". Include all that apply.
- **language**: ISO 639-1 code (e.g. "en", "es", "fr").
- **confidence**: 0–1 score for how confident you are in the classification.
- **isContentPage**: true if this is real content (article, video, etc.). false if it's a login page, error page, paywall, or empty page.

Output ONLY valid JSON.`;
}

// ── Stage 3: Content Extraction (AI cleanup) ──────────────────────────────────

export function extractContentPrompt(input: {
  readabilityOutput: string;
  sourceType: string;
  metadata: Record<string, unknown>;
}): string {
  const truncated = input.readabilityOutput.slice(0, TRUNCATE_LEN.readabilityOutput);
  const metadataStr = JSON.stringify(input.metadata, null, 2);

  return `You are a content cleaner for a personal information aggregator. Your job is to remove all non-content elements from Readability-extracted text and return only the core article body.

## Source
- **Source type:** ${input.sourceType}
- **Metadata:** ${metadataStr}

## Extracted Content (truncated)
${truncated}

## Instructions
Remove the following:
- Email chrome: headers, footers, unsubscribe links, social icons
- Promotional CTAs and call-to-action blocks
- Navigation elements (menus, breadcrumbs)
- Cookie notices and consent banners
- Related article sections at the bottom
- Author bio boilerplate at the very end
${input.sourceType === "gmail" ? "- Email template decorations (tables, borders, styling artifacts)" : ""}

Return ONLY the cleaned core content as plain text. No JSON, no markdown, no extra formatting. Just the body text.`;
}

// ── Stage 4: Content Analysis ─────────────────────────────────────────────────

export function analyzeContentPrompt(input: {
  cleanContent: string;
  allLinks: Array<{
    url: string;
    anchorText?: string;
    surroundingContext?: string;
  }>;
}): string {
  const truncated = input.cleanContent.slice(0, TRUNCATE_LEN.cleanContent);
  const linksSlice = input.allLinks.slice(0, MAX_LINKS);
  const linksSection = linksSlice
    .map(
      (l) =>
        `- URL: ${l.url} | anchor: "${l.anchorText ?? ""}" | context: "${(l.surroundingContext ?? "").slice(0, 100)}"`,
    )
    .join("\n");

  return `You are a content analyst for a personal information aggregator. Analyze the content and its links, then return structured JSON.

## Content (truncated)
${truncated}

## Links (first ${MAX_LINKS})
${linksSection}

## Instructions
Return a valid JSON object with this exact structure. Output ONLY the JSON object, no markdown fences.

{
  "relevantLinks": [
    { "url": "...", "title": "...", "relevance": "high|medium|low", "context": "..." }
  ],
  "entities": [
    { "name": "...", "type": "person|company|technology|topic|place" }
  ],
  "informationDensityScore": 0.8
}

Rules:
- **relevantLinks**: Include ONLY links with relevance "high" or "medium". Limit to the ${MAX_RELEVANT_LINKS} most relevant links. For each: url, title (from anchor or inferred), relevance, brief context.
- **entities**: Named entities (people, companies, technologies, topics, places). Include the most salient ones.
- **informationDensityScore**: 0–1 score for how information-rich the content is (0 = fluff, 1 = dense).

Output ONLY valid JSON.`;
}

// ── Stage 5: Enrichment ───────────────────────────────────────────────────────

export function enrichSummaryPrompt(title: string, content: string): string {
  return `Summarize the following content in 2-3 sentences, focusing on the key information:

Title: ${title}
Content: ${content.slice(0, TRUNCATE_LEN.enrichSummary)}

Respond with just the summary text, no preamble.`;
}

export function enrichTopicsPrompt(title: string, content: string): string {
  return `Given this content, extract 3-5 topic tags. Return ONLY a JSON array of lowercase strings.

Title: ${title}
Content: ${content.slice(0, TRUNCATE_LEN.enrichTopics)}

Example response: ["machine learning", "openai", "gpt-4"]`;
}
