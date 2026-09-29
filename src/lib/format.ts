export function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function stripMarkdown(md: string): string {
  return md
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`[^`]+`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: '"',
  ldquo: "“",
  lsquo: "‘",
  rdquo: "”",
  rsquo: "’",
};

function stripHtmlTags(value: string): string {
  return (
    value
      // Script and style bodies are never readable text, including when a
      // truncated excerpt cuts the closing tag off.
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<(script|style)\b[\s\S]*$/gi, " ")
      .replace(/<!--[\s\S]*?(?:-->|$)/g, " ")
      // Block-level boundaries must not glue neighbouring words together.
      .replace(/<\/?(?:p|div|br|li|tr|td|th|h[1-6]|blockquote|section|article)\b[^>]*>/gi, " ")
      .replace(/<[^>]*>/g, "")
      // A `left(content, n)` excerpt can end inside an unterminated tag.
      .replace(/<[^>]*$/, "")
  );
}

function decodeEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g,
    (match, entity: string) => {
      if (entity.startsWith("#")) {
        const codePoint =
          entity[1] === "x" || entity[1] === "X"
            ? Number.parseInt(entity.slice(2), 16)
            : Number.parseInt(entity.slice(1), 10);
        // The range guard keeps String.fromCodePoint total.
        if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return match;
        return String.fromCodePoint(codePoint);
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    }
  );
}

function stripMarkdownSyntax(value: string): string {
  return value
    .replace(/^\s{0,3}```[^\n]*$/gm, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, " ")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1");
}

/**
 * Renders stored Markdown or reader HTML as readable plain text.
 *
 * Summaries are stored as Markdown and extracted article content as HTML; both
 * are shown verbatim in text-only surfaces (Today's brief, search snippets),
 * where the raw syntax leaks through as literal characters. This derives the
 * display string only — nothing stored is changed.
 */
export function toPlainText(value: string | null | undefined): string {
  if (!value) return "";
  return stripMarkdownSyntax(decodeEntities(stripHtmlTags(value)))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reduces reader HTML to text for a model prompt, keeping the structure a reader relies on:
 * paragraphs stay separated by a blank line, headings become `## ` lines and list items `- `
 * lines. Unlike toPlainText, whitespace between blocks is preserved.
 */
export function htmlToReadableText(value: string | null | undefined): string {
  if (!value) return "";
  const text = value
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(script|style)\b[\s\S]*$/gi, " ")
    .replace(/<!--[\s\S]*?(?:-->|$)/g, " ")
    .replace(/<h[1-6]\b[^>]*>/gi, "\n\n## ")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:td|th)\b[^>]*>/gi, " ")
    .replace(
      /<\/?(?:p|div|h[1-6]|ul|ol|li|tr|table|blockquote|section|article|pre|figure|figcaption|header|footer|aside|hr)\b[^>]*>/gi,
      "\n\n"
    )
    .replace(/<[^>]*>/g, "")
    .replace(/<[^>]*$/, "");
  return decodeEntities(text)
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    // A list item or heading whose text sits in a nested block (<li><p>…</p></li>).
    .replace(/(?<=^|\n)(-|##)\n+(?=[^\n])/g, "$1 ")
    .replace(/^(?:-|##) *$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    // Consecutive list items read as one list, not one paragraph per item.
    .replace(/(?<=^|\n)(- [^\n]*)\n\n(?=- )/g, "$1\n")
    .trim();
}

export interface SummaryDigest {
  /** The TL;DR paragraph (or the whole summary when it has no sections). */
  lead: string;
  /** Key points, one plain-text sentence each. */
  points: string[];
}

/**
 * Splits a stored AI summary ("## TL;DR" / "## Key Points" Markdown) into a
 * lead paragraph and bullet points for card surfaces that cannot render
 * Markdown. Unstructured summaries become the lead with no points.
 */
export function toSummaryDigest(value: string | null | undefined, maxPoints = 4): SummaryDigest {
  if (!value) return { lead: "", points: [] };
  const sections = new Map<string, string>();
  let current = "lead";
  for (const line of value.split("\n")) {
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1].toLowerCase().replace(/[^a-z]/g, "");
      continue;
    }
    sections.set(current, `${sections.get(current) ?? ""}${line}\n`);
  }
  const leadSource = sections.get("tldr") ?? sections.get("lead") ?? "";
  // Content-aware briefs name their sections per piece; their first list stands in for key points.
  const isListLine = (line: string) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);
  const pointsSource =
    sections.get("keypoints") ??
    [...sections.entries()].find(
      ([key, body]) => key !== "tldr" && key !== "lead" && body.split("\n").some(isListLine)
    )?.[1] ??
    "";
  const points = pointsSource
    .split("\n")
    .filter(isListLine)
    .map((line) => toPlainText(line))
    .filter(Boolean)
    .slice(0, maxPoints);
  const lead = toPlainText(leadSource) || (points.length === 0 ? toPlainText(value) : "");
  return { lead, points };
}
