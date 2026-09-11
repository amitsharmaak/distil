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
