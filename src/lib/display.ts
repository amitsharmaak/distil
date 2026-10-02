import { toPlainText, toSummaryDigest } from "@/lib/format";
import type { ContentItem } from "@/lib/types";

function hostname(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

/** Publication identity, never the way a story was captured. */
export function publisherLabel(item: { publication?: string; url?: string }): string {
  const publication = toPlainText(item.publication);
  const captureLabel =
    /^(?:manual|link|extension|browser[- ]extension|web|gmail|slack|publisher)$/i;
  return (captureLabel.test(publication) ? "" : publication) || hostname(item.url) || "Saved item";
}

function normalizedLabel(value: string): string {
  return toPlainText(value)
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Strip only a trailing, separated site label that matches this story's publisher. */
export function displayTitle(
  item: Pick<ContentItem, "title" | "url"> & Partial<ContentItem>
): string {
  let title = toPlainText(item.title);
  if (!title || /^https?:\/\//i.test(title)) {
    title = trimOnWords(firstSentence(summaryLead(item.aiSummary || item.summary)), 100);
  }
  const host = hostname(item.url);
  const labels = [item.publication ?? "", host, host ? `www.${host}` : ""];
  // Also recognize the site name without its domain suffix (including .co.uk).
  const brand = host.match(/(?:^|\.)([^.]+)\.(?:(?:co|com|org|net)\.)?[a-z]{2,}$/i)?.[1];
  if (brand) labels.push(brand);
  if (/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(host)) {
    labels.push("YouTube");
  }
  const publishers = new Set(labels.map(normalizedLabel).filter(Boolean));
  // Some imported titles carry both a publication and a platform suffix.
  for (let pass = 0; pass < 2; pass += 1) {
    const match = title.match(/^(.*)(?:\||\s[-–—·]\s)\s*([^|]+)$/);
    if (!match || !match[1].trim() || !publishers.has(normalizedLabel(match[2]))) break;
    title = match[1].trim();
  }
  return title || "Untitled";
}

function trimOnWords(value: string, maxLength: number): string {
  const limit = Math.max(0, Math.floor(maxLength));
  if (limit < 2) return "";
  if (value.length <= limit) return value;
  const prefix = value.slice(0, limit - 1);
  // Keep a whole word even when the cut falls exactly on its ending.
  const boundary = /\s/.test(value[limit - 1]) ? prefix.length : prefix.lastIndexOf(" ");
  if (boundary <= 0) return "";
  return `${prefix
    .slice(0, boundary)
    .trimEnd()
    .replace(/[,:;—–-]+$/, "")}…`;
}

function summaryLead(value: string | undefined): string {
  const source = value?.trim() || "";
  const digest = toSummaryDigest(
    source
      .replace(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]\s*>/gi, "\n## $1\n")
      .replace(/^\s*\*\*(.+?)\*\*\s*:?\s*$/gm, "## $1")
      .replace(/^\s*(?:TL[;:]?DR|Summary|Key[ -]points)\s*:?\s*$/gim, "## $&")
  );
  let lead = toPlainText(digest.lead);
  // Imported posts sometimes introduce their summary with a label-only sentence.
  // Match the whole sentence so substantive prose about summaries stays intact.
  const labelOnlyIntro =
    /^(?:(?:here (?:is|are)|here['’]s)\s+(?:(?:the|a|my)\s+)?)?(?:tl[;:]?dr|key[ -]points)(?:\s*[-,:–—]?\s*\(?ELI5\)?)?[.!?:;]*$/i;
  while (lead) {
    const sentence = firstSentence(lead);
    if (!labelOnlyIntro.test(sentence)) break;
    lead = lead.slice(sentence.length).trimStart();
  }
  return lead.replace(/^(?:TL[;:]?DR|Summary|Key[ -]points)\s*:\s*/i, "");
}

function firstSentence(value: string): string {
  let sentence = "";
  for (const part of new Intl.Segmenter("en", { granularity: "sentence" }).segment(value)) {
    sentence += part.segment;
    // ICU can split after a title or an initial; keep the name with its sentence.
    if (!/(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs)|\b[A-Z])\.\s*$/.test(sentence)) break;
  }
  return sentence.trim();
}

/** One readable sentence from the brief, with no section labels or repeated video title. */
export function cardExcerpt(item: Partial<ContentItem>, maxLength = 180): string {
  const lead = summaryLead(item.aiSummary?.trim() || item.summary);
  if (!lead) return "";
  if (item.contentType === "video") {
    const title = displayTitle({ ...item, title: item.title ?? "", url: item.url ?? "" });
    // Capture metadata sometimes repeats the title with a "YouTube video" prefix.
    const comparable = displayTitle({
      ...item,
      title: lead.replace(/^(?:(?:youtube\s+)?video\s*[:–—-]\s*)/i, ""),
      url: item.url ?? "",
    });
    if (
      [title, item.title ?? ""].some(
        (candidate) => normalizedLabel(candidate) === normalizedLabel(comparable)
      )
    ) {
      return "";
    }
  }
  return trimOnWords(firstSentence(lead), maxLength);
}

function durationMinutes(duration: string | undefined): number | undefined {
  if (!duration?.trim()) return undefined;
  const value = duration.trim();
  if (/^\d{1,3}:\d{2}(?::\d{2})?$/.test(value)) {
    const parts = value.split(":").map(Number);
    if (parts.slice(1).some((part) => part > 59)) return undefined;
    const seconds = parts.reduce((total, part) => total * 60 + part, 0);
    return seconds > 0 ? Math.ceil(seconds / 60) : undefined;
  }
  const minutes = value.match(/^(\d+(?:\.\d+)?)\s*(?:m|min|mins|minutes?)$/i);
  return minutes && Number(minutes[1]) > 0 ? Math.ceil(Number(minutes[1])) : undefined;
}

/** Uses server list metadata; detail pages can estimate without another request. */
export function readingMinutes(item: Partial<ContentItem>): number {
  const duration = item.contentType === "video" ? durationMinutes(item.duration) : undefined;
  if (duration !== undefined) return duration;
  if (item.readingMinutes !== undefined && Number.isFinite(item.readingMinutes)) {
    if (item.readingMinutes >= 0) return Math.ceil(item.readingMinutes);
  }
  // Match the feed's char_length(COALESCE(NULLIF(full_content, ''), summary, '')):
  // count stored markup too, and count Unicode characters rather than UTF-16 units.
  const text = item.fullContent || item.summary || "";
  return Math.ceil(Array.from(text).length / 1200);
}

export function readTimeLabel(item: Partial<ContentItem>): string {
  if (item.contentType === "video") {
    return durationMinutes(item.duration) !== undefined ? item.duration!.trim() : "";
  }
  const minutes = readingMinutes(item);
  return minutes > 0 ? `${minutes} min read` : "";
}
