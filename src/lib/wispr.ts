/**
 * Wispr Flow shared meeting notes.
 *
 * A shared note (`notes.wisprflow.ai/shared/<slug>`) is a client-rendered Vite
 * app whose served HTML is an empty `<div id="root">`, so Readability finds
 * nothing to extract. The note itself is available unauthenticated from Wispr's
 * public share API, keyed by the slug in the URL. This module reads it from
 * there and renders the note's markdown body as reader HTML.
 */

const SHARE_API_ORIGIN = "https://api.wisprflow.ai";
const SHARE_API_PATH = "/api/v1/meetings/shared";
const REQUEST_TIMEOUT_MS = 5_000;
/** A shared note is prose; anything larger than this is not one. */
const MAX_RESPONSE_CHARACTERS = 2 * 1024 * 1024;

export interface WisprNote {
  title: string;
  owner: string | null;
  createdAt: string | null;
  /** The note body as Wispr serves it: markdown. */
  markdown: string;
}

/** The slug of a Wispr Flow share link, or null when the URL is not one. */
export function wisprShareSlug(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "notes.wisprflow.ai") return null;
    const segments = parsed.pathname.split("/").filter(Boolean);
    // Only the canonical share path. `/<slug>` also resolves in the app, but it
    // collides with its own routes (`/login`) and is not what sharing produces.
    if (segments.length !== 2 || segments[0] !== "shared") return null;
    return decodeURIComponent(segments[1]) || null;
  } catch {
    return null;
  }
}

export function isWisprUrl(url: string): boolean {
  return wisprShareSlug(url) !== null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Wispr names the owner in a profile object rather than a display-name field. */
function ownerName(owner: unknown): string | null {
  if (!owner || typeof owner !== "object") return null;
  const profile = (owner as { profile?: unknown }).profile;
  if (!profile || typeof profile !== "object") return null;
  const { first_name: first, last_name: last } = profile as Record<string, unknown>;
  const name = [text(first), text(last)].filter(Boolean).join(" ");
  return name || null;
}

/** Reads a shared note from Wispr's public API; null when it is not readable. */
export async function fetchWisprNote(slug: string): Promise<WisprNote | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${SHARE_API_ORIGIN}${SHARE_API_PATH}/${encodeURIComponent(slug)}`,
      { signal: controller.signal, headers: { Accept: "application/json" } }
    );
    if (!response.ok) return null;
    const body = await response.text();
    if (body.length > MAX_RESPONSE_CHARACTERS) return null;
    return parseWisprNote(body);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Reads the note out of a share-API response body; null when it carries none. */
export function parseWisprNote(body: string): WisprNote | null {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const note = payload as Record<string, unknown>;
  // `summary` is the note Wispr shows; `notes` carries the raw capture when a
  // summary has not been generated yet.
  const markdown = text(note.summary) ?? text(note.notes);
  if (!markdown) return null;
  return {
    title: text(note.title) ?? "Meeting notes",
    owner: ownerName(note.owner),
    createdAt: text(note.created_at),
    markdown,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Inline markdown on already-escaped text. Escaping first means an `href` taken
 * from the source is safe to place in an attribute as-is.
 */
function renderInline(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>");
}

/** Strips the inline markers a plain-text excerpt should not carry. */
function stripInline(value: string): string {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1$2")
    .replace(/(^|[\s(])_([^_\n]+)_/g, "$1$2");
}

interface ListFrame {
  indent: number;
  tag: "ul" | "ol";
}

/**
 * Renders the markdown subset Wispr emits — headings, nested bullet and ordered
 * lists, paragraphs and inline emphasis — to reader HTML plus a plain-text
 * rendering for the item excerpt.
 */
export function renderWisprMarkdown(markdown: string): { html: string; text: string } {
  const html: string[] = [];
  const plain: string[] = [];
  const stack: ListFrame[] = [];
  let paragraph: string[] = [];
  // Wispr writes its sections as `###`, so the note's own shallowest heading —
  // whatever it is — becomes h2 under the item title rather than a stray h4.
  const shallowest = Math.min(
    ...[...markdown.matchAll(/^(#{1,6})\s+\S/gm)].map((match) => match[1].length),
    6
  );

  const closeLists = (toIndent = -1): void => {
    while (stack.length && stack[stack.length - 1].indent > toIndent) {
      html.push(`</${(stack.pop() as ListFrame).tag}>`);
    }
  };

  const flushParagraph = (): void => {
    if (!paragraph.length) return;
    const joined = paragraph.join(" ");
    html.push(`<p>${renderInline(escapeHtml(joined))}</p>`);
    plain.push(stripInline(joined));
    paragraph = [];
  };

  for (const rawLine of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      closeLists();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeLists();
      const level = Math.min(heading[1].length - shallowest, 2) + 2;
      html.push(`<h${level}>${renderInline(escapeHtml(heading[2]))}</h${level}>`);
      plain.push(stripInline(heading[2]));
      continue;
    }

    const bullet = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      const indent = bullet[1].length;
      const tag: "ul" | "ol" = /^\d/.test(bullet[2]) ? "ol" : "ul";
      closeLists(indent);
      const top = stack[stack.length - 1];
      if (!top || top.indent < indent) {
        html.push(`<${tag}>`);
        stack.push({ indent, tag });
      }
      html.push(`<li>${renderInline(escapeHtml(bullet[3]))}</li>`);
      plain.push(`${"  ".repeat(Math.max(stack.length - 1, 0))}- ${stripInline(bullet[3])}`);
      continue;
    }

    closeLists();
    paragraph.push(line.trim());
  }

  flushParagraph();
  closeLists();
  return { html: html.join("\n"), text: plain.join("\n\n") };
}
