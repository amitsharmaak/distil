import "server-only";

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

import { connectorLogger } from "../../logger";
import type {
  ExtractedContentResult,
  RawExtractedLink,
} from "../../intelligence/types";
import { ensureSession } from "./session";
import { PublisherAuthRequired, type PublisherDefinition } from "./types";

const DEFAULT_CONCURRENCY = 1;
const DEFAULT_MIN_DELAY_MS = 2000;
const PAGE_TIMEOUT_MS = 30000;

interface PublisherGate {
  active: number;
  lastReleaseAt: number;
  waiters: Array<() => void>;
}

const gates = new Map<string, PublisherGate>();

function getGate(publisherId: string): PublisherGate {
  let gate = gates.get(publisherId);
  if (!gate) {
    gate = { active: 0, lastReleaseAt: 0, waiters: [] };
    gates.set(publisherId, gate);
  }
  return gate;
}

async function acquire(publisher: PublisherDefinition): Promise<void> {
  const concurrency = publisher.fetchConcurrency ?? DEFAULT_CONCURRENCY;
  const minDelay = publisher.minDelayMs ?? DEFAULT_MIN_DELAY_MS;
  const gate = getGate(publisher.id);

  if (gate.active >= concurrency) {
    await new Promise<void>((resolve) => gate.waiters.push(resolve));
  }
  gate.active += 1;

  const since = Date.now() - gate.lastReleaseAt;
  if (gate.lastReleaseAt > 0 && since < minDelay) {
    await new Promise((resolve) => setTimeout(resolve, minDelay - since));
  }
}

function release(publisher: PublisherDefinition): void {
  const gate = getGate(publisher.id);
  gate.active = Math.max(0, gate.active - 1);
  gate.lastReleaseAt = Date.now();
  const next = gate.waiters.shift();
  if (next) next();
}

function parseWithReadability(
  html: string,
  url: string,
): {
  title: string | null;
  byline: string | null;
  content: string;
  textContent: string;
  links: RawExtractedLink[];
} | null {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article) return null;

  const articleDom = new JSDOM(article.content ?? undefined, { url });
  const anchors = Array.from(
    articleDom.window.document.querySelectorAll("a[href]"),
  );
  const links: RawExtractedLink[] = anchors
    .map((a) => ({
      anchorText: (a.textContent?.trim() ?? "").slice(0, 200) || undefined,
      url: a.getAttribute("href") ?? "",
    }))
    .filter((l) => l.url.startsWith("http"))
    .filter((l, i, arr) => arr.findIndex((x) => x.url === l.url) === i)
    .slice(0, 50);

  return {
    title: article.title ?? null,
    byline: article.byline ?? null,
    content: article.content ?? "",
    textContent: article.textContent ?? "",
    links,
  };
}

export async function fetchArticle(
  publisher: PublisherDefinition,
  url: string,
): Promise<ExtractedContentResult> {
  await acquire(publisher);
  let context: Awaited<ReturnType<typeof ensureSession>> | undefined;
  try {
    context = await ensureSession(publisher);
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: PAGE_TIMEOUT_MS });

      if (publisher.extract) {
        const custom = await publisher.extract(page);
        const parsed = parseWithReadability(custom.html, url);
        return {
          cleanContent: parsed?.content ?? custom.html,
          cleanTextContent: parsed?.textContent ?? "",
          title: custom.title || parsed?.title || "Untitled",
          author: custom.author ?? parsed?.byline ?? undefined,
          publication: publisher.name,
          allLinks: parsed?.links ?? [],
        };
      }

      const html = await page.content();
      const parsed = parseWithReadability(html, url);
      if (!parsed) {
        return {
          cleanContent: "",
          cleanTextContent: "",
          title: "Untitled",
          publication: publisher.name,
          allLinks: [],
        };
      }
      return {
        cleanContent: parsed.content,
        cleanTextContent: parsed.textContent,
        title: parsed.title ?? "Untitled",
        author: parsed.byline ?? undefined,
        publication: publisher.name,
        allLinks: parsed.links,
      };
    } finally {
      await page.close().catch((err) => {
        connectorLogger.warn(
          { err, publisherId: publisher.id },
          "Failed to close publisher fetch page",
        );
      });
    }
  } catch (err) {
    if (err instanceof PublisherAuthRequired) throw err;
    throw err;
  } finally {
    if (context) {
      await context.close().catch((err) => {
        connectorLogger.warn(
          { err, publisherId: publisher.id },
          "Failed to close publisher fetch context",
        );
      });
    }
    release(publisher);
  }
}
