/**
 * Content extraction module — extracts article body and links from a URL.
 *
 * Uses @mozilla/readability + jsdom to strip nav, ads, and clutter, returning
 * clean HTML (for reader view) and plain text (for AI summarization).
 *
 * Also extracts all hyperlinks from the article body so they can be surfaced
 * in the reader view UI.
 *
 * ⚠️  SERVER-SIDE ONLY — never import this from a "use client" component.
 */

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { sanitizeArticleHtml } from "@/lib/content-sanitizer";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** SPAs and walled-garden sites where Readability extraction won't work. */
function isUnextractable(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    return host === "twitter.com" || host === "x.com";
  } catch {
    return false;
  }
}

export interface ExtractedLink {
  text: string;
  url: string;
}

export interface ExtractedContent {
  title: string | null;
  byline: string | null;
  /** Cleaned HTML from Readability — used in reader view. */
  content: string;
  /** Plain text version — used as Gemini summarization input. */
  textContent: string;
  /** Links found in the article body (capped at 50). */
  extractedLinks: ExtractedLink[];
}

/** Convert article HTML to text without merging words across element boundaries. */
export function extractPlaintextFromHtml(html: string, url = "https://example.invalid/"): string {
  if (!html.trim()) return "";
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;
  document
    .querySelectorAll("script, style, nav, header, footer, form, noscript, svg")
    .forEach((element) => element.remove());
  document
    .querySelectorAll(
      "br, p, div, section, article, main, aside, li, h1, h2, h3, h4, h5, h6, blockquote, td, th"
    )
    .forEach((element) => element.append(document.createTextNode("\n")));
  return document.body?.textContent ?? "";
}

/** Parses an already-fetched response without performing another network request. */
export function extractContentFromHtml(html: string, url: string): ExtractedContent | null {
  if (isUnextractable(url)) return null;
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article) return null;

  const content = sanitizeArticleHtml(article.content ?? "");
  const articleDom = new JSDOM(content, { url });
  const anchors = Array.from(articleDom.window.document.querySelectorAll("a[href]"));
  const extractedLinks: ExtractedLink[] = anchors
    .map((a) => ({
      text: (a.textContent?.trim() ?? "").slice(0, 200),
      url: a.getAttribute("href") ?? "",
    }))
    .filter((link) => link.url.startsWith("http") && link.text.length > 0)
    .filter((link, index, links) => links.findIndex((other) => other.url === link.url) === index)
    .slice(0, 50);

  return {
    title: article.title ?? null,
    byline: article.byline ?? null,
    content,
    textContent: content ? extractPlaintextFromHtml(content, url) : (article.textContent ?? ""),
    extractedLinks,
  };
}

/**
 * Fetches a URL and extracts the main article content using Readability.
 * Returns null on any failure (network error, timeout, non-parseable page).
 */
export async function extractContent(url: string): Promise<ExtractedContent | null> {
  if (isUnextractable(url)) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "text/html",
      },
    });

    clearTimeout(timeoutId);
    if (!response.ok) return null;

    const html = await response.text();

    return extractContentFromHtml(html, url);
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}
