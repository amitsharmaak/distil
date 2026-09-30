/**
 * Pure helpers that turn a stored deep-research report (model-written markdown) into a readable
 * page: strip the duplicate title and horizontal rules, lift the TL;DR out, compact parenthesised
 * citation links, and derive the table of contents and reading stats.
 *
 * Everything here is deterministic and free of React so it can be unit tested directly. Line
 * numbers returned by `extractHeadings` are 1-based and refer to the exact string passed in, which
 * is also the string handed to the markdown renderer; the heading component maps a rendered
 * heading back to its id through `node.position.start.line`.
 */

/** Link title used to mark a link that sat in a parenthesised citation group. */
export const CITATION_LINK_TITLE = "distil:cite";

/** Element id of the TL;DR block, reserved so no heading slug collides with it. */
export const SUMMARY_ANCHOR_ID = "tldr";

const WORDS_PER_MINUTE = 230;

const FENCE_RE = /^\s{0,3}(```|~~~)/;
const ATX_HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const THEMATIC_BREAK_RE = /^\s{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const SUMMARY_HEADING_RE =
  /^(?:\*\*|__)?\s*(?:tl;?\s?dr|summary|executive\s+summary)\s*(?:\*\*|__)?\s*:?\s*$/i;

export interface ReportHeading {
  /** 2 or 3 — only `##` and `###` headings enter the table of contents. */
  level: 2 | 3;
  text: string;
  id: string;
  /** 1-based line of the heading within the markdown the headings were extracted from. */
  line: number;
}

export interface PreparedReport {
  /** The TL;DR / summary section body, or null when the report has none. */
  summary: string | null;
  /** The report body to render, cleaned and without the summary section. */
  body: string;
  /** `##`/`###` headings of `body`, with stable, de-duplicated ids. */
  headings: ReportHeading[];
  /** Number of `##` sections in `body`. */
  sectionCount: number;
  /** Estimated minutes to read summary plus body (at least 1). */
  readingMinutes: number;
}

/** Calls `visit` for each line with whether it sits inside (or delimits) a fenced code block. */
function forEachLine(
  markdown: string,
  visit: (line: string, index: number, inFence: boolean) => void
): void {
  let fence: string | null = null;
  markdown.split("\n").forEach((line, index) => {
    const match = line.match(FENCE_RE);
    if (match) {
      if (fence === null) fence = match[1];
      else if (match[1] === fence) {
        visit(line, index, true);
        fence = null;
        return;
      }
      visit(line, index, true);
      return;
    }
    visit(line, index, fence !== null);
  });
}

/** Plain text of a heading's inline markdown (links, emphasis and code markers removed). */
export function headingPlainText(inline: string): string {
  return inline
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
}

/** URL-fragment slug: lowercase ASCII words joined by hyphens; "section" when nothing is left. */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

/**
 * Returns a slug function that de-duplicates within one document: the second "Overview" becomes
 * "overview-2", the third "overview-3". `reserved` ids are treated as already taken.
 */
export function createSlugger(reserved: string[] = []): (text: string) => string {
  const taken = new Set(reserved);
  return (text: string) => {
    const base = slugify(text);
    let candidate = base;
    let n = 2;
    while (taken.has(candidate)) candidate = `${base}-${n++}`;
    taken.add(candidate);
    return candidate;
  };
}

function isSummaryHeadingText(text: string): boolean {
  return SUMMARY_HEADING_RE.test(text.trim());
}

/**
 * Removes the model's duplicate title and its horizontal rules:
 * - the first non-empty line, when it is an H1 other than a summary heading, is dropped (the page
 *   header already shows the question);
 * - any remaining H1 is demoted to H2 so section levels stay consistent;
 * - thematic breaks (`---`, `***`, `___`) are dropped unless they could be a setext underline.
 * Fenced code is left untouched.
 */
export function stripTitleAndRules(markdown: string): string {
  const out: string[] = [];
  let seenContent = false;
  forEachLine(markdown.replace(/\r\n?/g, "\n"), (line, _index, inFence) => {
    if (inFence) {
      seenContent = true;
      out.push(line);
      return;
    }
    const heading = line.match(ATX_HEADING_RE);
    if (heading && heading[1] === "#") {
      if (!seenContent && !isSummaryHeadingText(heading[2])) {
        seenContent = true;
        return;
      }
      seenContent = true;
      out.push(line.replace(/^(\s{0,3})#(?=\s)/, "$1##"));
      return;
    }
    if (THEMATIC_BREAK_RE.test(line)) {
      const previous = out.length > 0 ? out[out.length - 1] : "";
      if (previous.trim() === "" || ATX_HEADING_RE.test(previous)) return;
    }
    if (line.trim() !== "") seenContent = true;
    out.push(line);
  });
  // Collapse the blank runs left behind by removed lines.
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const LINK_SOURCE = String.raw`\[[^\]\n]*\]\(https?:\/\/[^)\s]+\)`;
const BARE_URL_SOURCE = String.raw`https?:\/\/[^\s)\]]+`;
const CITATION_ITEM = `(?:${LINK_SOURCE}|${BARE_URL_SOURCE})`;
const CITATION_GROUP_RE = new RegExp(
  String.raw`(?<!\])[ \t]*\(\s*(?:(?:sources?|via|see)\s*:?\s*)?(${CITATION_ITEM}(?:\s*(?:,|;|and|&)\s*${CITATION_ITEM})*)\s*\)`,
  "gi"
);
const CITATION_ITEM_RE = new RegExp(CITATION_ITEM, "gi");

/**
 * Rewrites parenthesised citation groups — "(Source: [Title](url))", "([A](u1), [B](u2))",
 * "(https://…)" — into bare links marked with `CITATION_LINK_TITLE`, which the link component
 * renders as compact domain chips. Links elsewhere in the prose are left alone.
 */
export function compactCitationLinks(markdown: string): string {
  const out: string[] = [];
  forEachLine(markdown, (line, _index, inFence) => {
    if (inFence) {
      out.push(line);
      return;
    }
    out.push(
      line.replace(CITATION_GROUP_RE, (_match, group: string) => {
        const items = group.match(CITATION_ITEM_RE) ?? [];
        const links = items.map((item) => {
          const link = item.match(/^\[([^\]\n]*)\]\((https?:\/\/[^)\s]+)\)$/);
          if (link) return `[${link[1]}](${link[2]} "${CITATION_LINK_TITLE}")`;
          return `[${item}](${item} "${CITATION_LINK_TITLE}")`;
        });
        return ` ${links.join(" ")}`;
      })
    );
  });
  return out.join("\n");
}

/**
 * Splits out the first TL;DR / Summary / Executive Summary section (any heading level 1–3). Its
 * body runs to the next heading of the same or a higher level. Returns `summary: null` and the
 * markdown unchanged when there is no such section or it is empty.
 */
export function extractSummary(markdown: string): { summary: string | null; rest: string } {
  const lines = markdown.split("\n");
  let start = -1;
  let level = 0;
  let end = lines.length;
  forEachLine(markdown, (line, index, inFence) => {
    if (inFence || end !== lines.length) return;
    const heading = line.match(ATX_HEADING_RE);
    if (!heading) return;
    const headingLevel = heading[1].length;
    if (start === -1) {
      if (headingLevel <= 3 && isSummaryHeadingText(heading[2])) {
        start = index;
        level = headingLevel;
      }
    } else if (headingLevel <= level) {
      end = index;
    }
  });
  if (start === -1) return { summary: null, rest: markdown };
  const summary = lines
    .slice(start + 1, end)
    .join("\n")
    .trim();
  if (!summary) return { summary: null, rest: markdown };
  const rest = [...lines.slice(0, start), ...lines.slice(end)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { summary, rest };
}

/** `##` and `###` headings outside fenced code, with ids unique within the document. */
export function extractHeadings(markdown: string): ReportHeading[] {
  const slug = createSlugger([SUMMARY_ANCHOR_ID]);
  const headings: ReportHeading[] = [];
  forEachLine(markdown, (line, index, inFence) => {
    if (inFence) return;
    const heading = line.match(ATX_HEADING_RE);
    if (!heading) return;
    const level = heading[1].length;
    if (level !== 2 && level !== 3) return;
    const text = headingPlainText(heading[2]);
    if (!text) return;
    headings.push({ level, text, id: slug(text), line: index + 1 });
  });
  return headings;
}

/** Words a reader actually reads: URLs, markdown syntax and link targets are not counted. */
export function countWords(markdown: string): number {
  const text = markdown
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#>*_`|[\]-]+/g, " ");
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu);
  return words ? words.length : 0;
}

export function estimateReadingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}

/** Link title marking a group of numbered citation markers (`[1][3]`) rewritten by `linkCitationMarkers`. */
export const CITATION_REF_TITLE = "distil:ref";

/** Element id of numbered source `n` in the sources list. */
export function sourceAnchorId(id: number): string {
  return `source-${id}`;
}

/**
 * A run of adjacent numbered markers, `[2]` or `[1][3]` (also `[1, 3]`), not preceded by `]` or
 * `!` (reference-style link text, images) and not followed by `(` or `:` (inline links, link
 * reference definitions).
 */
const MARKER_RUN_RE = /(?<![\]!\\])((?:\[\d{1,3}(?:\s*,\s*\d{1,3})*\])+)(?![(:])/g;
const INLINE_CODE_RE = /(`+)[\s\S]*?\1/g;

/** Ids in a marker run, in order, de-duplicated. */
export function markerRunIds(run: string): number[] {
  const ids = (run.match(/\d{1,3}/g) ?? []).map(Number);
  return [...new Set(ids)];
}

function linkMarkersInText(text: string, knownIds: Set<number>): string {
  return text.replace(MARKER_RUN_RE, (run: string) => {
    const ids = markerRunIds(run).filter((id) => knownIds.has(id));
    if (ids.length === 0) return run;
    return `[${ids.join(",")}](#${sourceAnchorId(ids[0])} "${CITATION_REF_TITLE}")`;
  });
}

/**
 * Rewrites numbered citation markers into in-page links to the sources list, one link per run of
 * adjacent markers (`[1][3]` → `[1,3](#source-1 "distil:ref")`), which the link component renders
 * as one superscript group. Ids missing from `knownIds` stay plain text (a run with no known id
 * is left untouched). Fenced and inline code are never changed; line structure is preserved, so
 * heading line numbers stay valid.
 */
export function linkCitationMarkers(markdown: string, knownIds: Iterable<number>): string {
  const known = new Set(knownIds);
  if (known.size === 0) return markdown;
  const out: string[] = [];
  forEachLine(markdown, (line, _index, inFence) => {
    if (inFence) {
      out.push(line);
      return;
    }
    let result = "";
    let last = 0;
    for (const match of line.matchAll(INLINE_CODE_RE)) {
      const at = match.index ?? 0;
      result += linkMarkersInText(line.slice(last, at), known) + match[0];
      last = at + match[0].length;
    }
    out.push(result + linkMarkersInText(line.slice(last), known));
  });
  return out.join("\n");
}

/** Full preparation pipeline used by the report page. */
export function prepareReport(markdown: string): PreparedReport {
  const cleaned = compactCitationLinks(stripTitleAndRules(markdown ?? ""));
  const { summary, rest } = extractSummary(cleaned);
  const headings = extractHeadings(rest);
  const words = countWords(rest) + (summary ? countWords(summary) : 0);
  return {
    summary,
    body: rest,
    headings,
    sectionCount: headings.filter((heading) => heading.level === 2).length,
    readingMinutes: estimateReadingMinutes(words),
  };
}
