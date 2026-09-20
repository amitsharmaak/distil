/**
 * Renders an X Article (long-form post) from the Draft.js raw content that the
 * fxtwitter API returns into reader HTML plus plain text.
 *
 * Block types map to semantic HTML; inline style ranges (Bold/Italic/Code) and
 * LINK entities become inline markup; atomic blocks carry embedded tweets,
 * fenced markdown code and images. Everything is escaped here and still passes
 * through `sanitizeArticleHtml` at the render boundary.
 */

export interface XArticleBlock {
  key?: string;
  type?: string;
  text?: string;
  inlineStyleRanges?: Array<{ offset: number; length: number; style: string }>;
  entityRanges?: Array<{ offset: number; length: number; key: number }>;
}

export interface XArticleEntity {
  key?: number | string;
  value?: { type?: string; data?: Record<string, unknown> };
}

export interface XArticleContent {
  blocks?: XArticleBlock[];
  entityMap?: XArticleEntity[] | Record<string, XArticleEntity["value"]>;
}

export interface XArticleMedia {
  media_id?: string;
  media_info?: { original_img_url?: string; __typename?: string };
}

export interface XArticleInput {
  title?: string;
  preview_text?: string;
  content?: XArticleContent;
  media_entities?: XArticleMedia[];
}

export interface RenderedXArticle {
  html: string;
  text: string;
  links: Array<{ text: string; url: string }>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

type Entity = NonNullable<XArticleEntity["value"]>;

function entityLookup(content: XArticleContent): Map<string, Entity> {
  const map = new Map<string, Entity>();
  const raw = content.entityMap;
  if (Array.isArray(raw)) {
    for (const entry of raw) if (entry?.value) map.set(String(entry.key), entry.value);
  } else if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw)) if (value) map.set(key, value);
  }
  return map;
}

const STYLE_TAGS: Record<string, string> = {
  BOLD: "strong",
  ITALIC: "em",
  CODE: "code",
  UNDERLINE: "u",
  STRIKETHROUGH: "s",
};

/** Applies inline styles and link entities to one block's text. */
function renderInline(
  block: XArticleBlock,
  entities: Map<string, Entity>,
  links: RenderedXArticle["links"]
): string {
  const text = block.text ?? "";
  type Boundary = { open: string; close: string; start: number; end: number };
  const spans: Boundary[] = [];
  for (const range of block.inlineStyleRanges ?? []) {
    const tag = STYLE_TAGS[range.style?.toUpperCase()];
    if (!tag) continue;
    spans.push({
      open: `<${tag}>`,
      close: `</${tag}>`,
      start: range.offset,
      end: range.offset + range.length,
    });
  }
  for (const range of block.entityRanges ?? []) {
    const entity = entities.get(String(range.key));
    const url = entity?.data?.url;
    if (entity?.type !== "LINK" || !isHttpUrl(url)) continue;
    links.push({ text: text.slice(range.offset, range.offset + range.length), url });
    spans.push({
      open: `<a href="${escapeHtml(url)}">`,
      close: "</a>",
      start: range.offset,
      end: range.offset + range.length,
    });
  }
  if (spans.length === 0) return escapeHtml(text);

  // Emit character by character with tags opened/closed at their offsets.
  // Overlapping ranges are closed in reverse order of opening to keep nesting valid.
  const opensAt = new Map<number, Boundary[]>();
  const closesAt = new Map<number, Boundary[]>();
  for (const span of spans) {
    opensAt.set(span.start, [...(opensAt.get(span.start) ?? []), span]);
    closesAt.set(span.end, [...(closesAt.get(span.end) ?? []), span]);
  }
  let out = "";
  const openStack: Boundary[] = [];
  for (let index = 0; index <= text.length; index += 1) {
    const closing = closesAt.get(index) ?? [];
    if (closing.length > 0) {
      // Pop down to the deepest span that ends here, then reopen the survivors.
      const deepest = Math.min(...closing.map((span) => openStack.indexOf(span)));
      const reopen = openStack.splice(deepest).reverse();
      for (const span of reopen) out += span.close;
      for (const span of reopen.reverse()) {
        if (closing.includes(span)) continue;
        out += span.open;
        openStack.push(span);
      }
    }
    for (const span of opensAt.get(index) ?? []) {
      out += span.open;
      openStack.push(span);
    }
    if (index < text.length) out += escapeHtml(text[index]);
  }
  while (openStack.length > 0) out += (openStack.pop() as Boundary).close;
  return out;
}

/** Turns fenced markdown from a MARKDOWN entity into a code block; plain text otherwise. */
function renderMarkdownEntity(markdown: string): { html: string; text: string } {
  const fenced = markdown.match(/^```([\w-]*)\n([\s\S]*?)\n?```\s*$/);
  if (fenced) {
    const language = fenced[1] ? ` class="language-${escapeHtml(fenced[1])}"` : "";
    return {
      html: `<pre><code${language}>${escapeHtml(fenced[2])}</code></pre>`,
      text: fenced[2],
    };
  }
  return { html: `<p>${escapeHtml(markdown)}</p>`, text: markdown };
}

function renderAtomic(
  block: XArticleBlock,
  entities: Map<string, Entity>,
  media: Map<string, string>
): { html: string; text: string } | undefined {
  const range = block.entityRanges?.[0];
  const entity = range ? entities.get(String(range.key)) : undefined;
  const data = entity?.data ?? {};
  switch (entity?.type) {
    case "TWEET": {
      const tweetId = typeof data.tweetId === "string" ? data.tweetId : undefined;
      if (!tweetId || !/^\d+$/.test(tweetId)) return undefined;
      const url = `https://x.com/i/status/${tweetId}`;
      return {
        html: `<blockquote><p>Embedded post: <a href="${url}">${url}</a></p></blockquote>`,
        text: `Embedded post: ${url}`,
      };
    }
    case "MARKDOWN":
      return typeof data.markdown === "string" ? renderMarkdownEntity(data.markdown) : undefined;
    case "MEDIA":
    case "IMAGE": {
      const ids = Array.isArray(data.mediaItems)
        ? (data.mediaItems as Array<{ mediaId?: string }>).map((item) => item.mediaId)
        : [data.mediaId];
      const urls = ids
        .map((id) => (typeof id === "string" ? media.get(id) : undefined))
        .filter(isHttpUrl);
      if (urls.length === 0) return undefined;
      return {
        html: urls.map((url) => `<figure><img src="${escapeHtml(url)}" alt=""></figure>`).join(""),
        text: "",
      };
    }
    default:
      return undefined;
  }
}

const BLOCK_TAGS: Record<string, string> = {
  unstyled: "p",
  paragraph: "p",
  "header-one": "h2",
  "header-two": "h2",
  "header-three": "h3",
  "header-four": "h4",
  "header-five": "h4",
  "header-six": "h4",
  blockquote: "blockquote",
  "code-block": "pre",
};

const LIST_TAGS: Record<string, "ul" | "ol"> = {
  "unordered-list-item": "ul",
  "ordered-list-item": "ol",
};

/** Renders an X Article into HTML, plain text and the links it references. */
export function renderXArticle(article: XArticleInput): RenderedXArticle | undefined {
  const blocks = article.content?.blocks ?? [];
  if (blocks.length === 0) return undefined;
  const entities = entityLookup(article.content ?? {});
  const media = new Map<string, string>();
  for (const item of article.media_entities ?? []) {
    const url = item.media_info?.original_img_url;
    if (item.media_id && isHttpUrl(url)) media.set(item.media_id, url);
  }

  const html: string[] = [];
  const text: string[] = [];
  const links: RenderedXArticle["links"] = [];
  let openList: "ul" | "ol" | undefined;
  const closeList = () => {
    if (openList) html.push(`</${openList}>`);
    openList = undefined;
  };

  for (const block of blocks) {
    const type = block.type ?? "unstyled";
    const list = LIST_TAGS[type];
    if (list) {
      if (openList !== list) {
        closeList();
        html.push(`<${list}>`);
        openList = list;
      }
      html.push(`<li>${renderInline(block, entities, links)}</li>`);
      if (block.text) text.push(`- ${block.text}`);
      continue;
    }
    closeList();

    if (type === "atomic") {
      const rendered = renderAtomic(block, entities, media);
      if (rendered) {
        html.push(rendered.html);
        if (rendered.text) text.push(rendered.text);
      }
      continue;
    }

    const content = block.text ?? "";
    if (!content.trim()) continue;
    const tag = BLOCK_TAGS[type] ?? "p";
    html.push(
      tag === "pre"
        ? `<pre><code>${escapeHtml(content)}</code></pre>`
        : `<${tag}>${renderInline(block, entities, links)}</${tag}>`
    );
    text.push(content);
  }
  closeList();

  if (text.length === 0) return undefined;
  return { html: html.join("\n"), text: text.join("\n\n"), links };
}
