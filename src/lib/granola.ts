/**
 * Granola meeting-notes capture.
 *
 * A shared Granola note (`notes.granola.ai/d/<id>`) is a Next.js page whose
 * visible body is rendered client-side, but the note itself — a ProseMirror
 * document — plus the title, owner and creation time ship in the React Server
 * Components payload embedded in the HTML. This module reads that payload from
 * the already-fetched page and renders the note as reader HTML.
 */

import { readJsonObjectAt } from "./embedded-json";

export function isGranolaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "notes.granola.ai" && parsed.pathname.startsWith("/d/");
  } catch {
    return false;
  }
}

/** ProseMirror node as Granola serialises it. */
export interface ProseMirrorNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: ProseMirrorNode[];
}

export interface GranolaNote {
  title: string;
  owner: string | null;
  createdAt: string | null;
  doc: ProseMirrorNode;
}

/** Joins the `self.__next_f.push([1,"…"])` chunks back into one payload string. */
function flightPayload(html: string): string {
  const chunks: string[] = [];
  for (const match of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
    try {
      chunks.push(JSON.parse(`"${match[1]}"`) as string);
    } catch {
      // A chunk that is not a plain string carries no note content.
    }
  }
  return chunks.join("");
}

/** Reads the note from a fetched Granola share page; null when it is not one. */
export function parseGranolaPage(html: string): GranolaNote | null {
  const payload = flightPayload(html);
  const docStart = payload.indexOf('{"type":"doc","content":[');
  if (docStart < 0) return null;
  const doc = readJsonObjectAt(payload, docStart) as ProseMirrorNode | null;
  if (!doc?.content?.length) return null;

  const documentStart = payload.lastIndexOf('"document":{', docStart);
  const document =
    documentStart >= 0
      ? (readJsonObjectAt(payload, documentStart + '"document":'.length) as {
          title?: string;
          created_at?: string;
          owner?: { name?: string };
        } | null)
      : null;
  const title =
    document?.title?.trim() ||
    html.match(/<meta property="og:title" content="([^"]*)"/)?.[1]?.trim() ||
    "Meeting notes";
  return {
    title: decodeHtml(title),
    owner: document?.owner?.name?.trim() || null,
    createdAt: document?.created_at ?? null,
    doc,
  };
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const MARK_TAGS: Record<string, string> = {
  bold: "strong",
  strong: "strong",
  italic: "em",
  em: "em",
  underline: "u",
  strike: "s",
  code: "code",
};

function renderInline(node: ProseMirrorNode): string {
  if (node.type === "hardBreak") return "<br>";
  if (node.type !== "text") return (node.content ?? []).map(renderInline).join("");
  let html = escapeHtml(node.text ?? "");
  for (const mark of node.marks ?? []) {
    if (mark.type === "link") {
      const href = mark.attrs?.href;
      if (typeof href === "string" && /^https?:\/\//i.test(href)) {
        html = `<a href="${escapeHtml(href)}">${html}</a>`;
      }
      continue;
    }
    const tag = MARK_TAGS[mark.type ?? ""];
    if (tag) html = `<${tag}>${html}</${tag}>`;
  }
  return html;
}

function plainText(node: ProseMirrorNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(plainText).join("");
}

/** Renders a ProseMirror document (headings, lists, quotes, code, rules) to reader HTML. */
export function renderProseMirror(doc: ProseMirrorNode): { html: string; text: string } {
  const html: string[] = [];
  const text: string[] = [];

  const renderBlock = (node: ProseMirrorNode, depth: number): void => {
    switch (node.type) {
      case "heading": {
        const level = Math.min(Math.max(Number(node.attrs?.level ?? 2), 1), 4) + 1;
        const tag = `h${Math.min(level, 4)}`;
        html.push(`<${tag}>${renderInline(node)}</${tag}>`);
        text.push(plainText(node));
        return;
      }
      case "paragraph": {
        const inner = renderInline(node);
        if (!inner.trim()) return;
        html.push(`<p>${inner}</p>`);
        text.push(plainText(node));
        return;
      }
      case "bulletList":
      case "orderedList": {
        const tag = node.type === "bulletList" ? "ul" : "ol";
        html.push(`<${tag}>`);
        for (const item of node.content ?? []) renderBlock(item, depth + 1);
        html.push(`</${tag}>`);
        return;
      }
      case "listItem": {
        html.push("<li>");
        const [first, ...rest] = node.content ?? [];
        if (first?.type === "paragraph") {
          html.push(renderInline(first));
          text.push(`${"  ".repeat(Math.max(depth - 1, 0))}- ${plainText(first)}`);
        } else if (first) {
          renderBlock(first, depth);
        }
        for (const child of rest) renderBlock(child, depth);
        html.push("</li>");
        return;
      }
      case "blockquote": {
        html.push("<blockquote>");
        for (const child of node.content ?? []) renderBlock(child, depth);
        html.push("</blockquote>");
        return;
      }
      case "codeBlock": {
        const code = plainText(node);
        html.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
        text.push(code);
        return;
      }
      case "horizontalRule":
        html.push("<hr>");
        return;
      default:
        for (const child of node.content ?? []) renderBlock(child, depth);
    }
  };

  for (const node of doc.content ?? []) renderBlock(node, 0);
  return { html: html.join("\n"), text: text.join("\n\n") };
}
