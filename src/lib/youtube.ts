/**
 * YouTube capture support.
 *
 * The watch page is a JavaScript shell, but it embeds `ytInitialPlayerResponse`
 * with the video's metadata. Captions come from YouTube's innertube player
 * endpoint (the caption URLs on the watch page itself return empty bodies for
 * server-side callers). Both hosts are fixed and public, so these fetches sit
 * outside the SSRF-pinned article fetcher.
 */

import { readJsonObjectAt } from "./embedded-json";

const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com", "youtu.be"]);

/** Video id from watch, short, shorts, live and embed URLs. */
export function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!YOUTUBE_HOSTS.has(host)) return null;
    const candidate =
      host === "youtu.be"
        ? parsed.pathname.slice(1).split("/")[0]
        : parsed.pathname === "/watch"
          ? parsed.searchParams.get("v")
          : (parsed.pathname.match(/^\/(?:shorts|live|embed)\/([^/?]+)/)?.[1] ?? null);
    return candidate && /^[\w-]{11}$/.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function isYouTubeUrl(url: string): boolean {
  return extractYouTubeId(url) !== null;
}

export interface YouTubeVideoDetails {
  videoId: string;
  title: string;
  author: string | null;
  description: string;
  lengthSeconds: number | null;
  thumbnailUrl: string | null;
  publishDate: string | null;
}

/** Reads the video metadata embedded in an already-fetched watch page. */
export function parseYouTubeWatchPage(html: string): YouTubeVideoDetails | null {
  const marker = "ytInitialPlayerResponse = ";
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const payload = readJsonObjectAt(html, start + marker.length);
  return payload ? detailsFromPlayerResponse(payload) : null;
}

/** Video details from a player response (watch page blob or innertube reply). */
function detailsFromPlayerResponse(payload: Record<string, unknown>): YouTubeVideoDetails | null {
  const details = payload.videoDetails as
    | {
        videoId?: string;
        title?: string;
        author?: string;
        shortDescription?: string;
        lengthSeconds?: string;
        thumbnail?: { thumbnails?: Array<{ url?: string; width?: number }> };
      }
    | undefined;
  if (!details?.videoId || !details.title) return null;
  const thumbnails = details.thumbnail?.thumbnails ?? [];
  const largest = thumbnails.reduce<{ url?: string; width?: number } | undefined>(
    (best, item) => ((item.width ?? 0) > (best?.width ?? -1) ? item : best),
    undefined
  );
  const microformat = (
    payload.microformat as { playerMicroformatRenderer?: { publishDate?: string } }
  )?.playerMicroformatRenderer;
  const length = Number(details.lengthSeconds);
  return {
    videoId: details.videoId,
    title: details.title,
    author: details.author ?? null,
    description: details.shortDescription ?? "",
    lengthSeconds: Number.isFinite(length) && length > 0 ? length : null,
    thumbnailUrl: largest?.url ?? null,
    publishDate: microformat?.publishDate ?? null,
  };
}

export interface TranscriptSegment {
  /** Start time in seconds. */
  start: number;
  text: string;
}

const INNERTUBE_PLAYER = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const INNERTUBE_CLIENT = {
  clientName: "ANDROID",
  clientVersion: "20.10.38",
  androidSdkVersion: 30,
  hl: "en",
};

interface InnertubePlayerResponse extends Record<string, unknown> {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: Array<{ baseUrl?: string; languageCode?: string; kind?: string }>;
    };
  };
}

/** Calls the innertube player endpoint; null when YouTube declines. */
async function fetchInnertubePlayer(
  videoId: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<InnertubePlayerResponse | null> {
  try {
    const response = await fetchImpl(INNERTUBE_PLAYER, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
      body: JSON.stringify({ videoId, context: { client: INNERTUBE_CLIENT } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    return (await response.json()) as InnertubePlayerResponse;
  } catch {
    return null;
  }
}

/**
 * Video details when the watch page did not carry them (datacenter egress
 * gets a consent or bot interstitial): innertube first, then oEmbed, which
 * only knows title, channel and thumbnail.
 */
export async function fetchYouTubeVideoDetails(
  videoId: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000
): Promise<YouTubeVideoDetails | null> {
  const player = await fetchInnertubePlayer(videoId, fetchImpl, timeoutMs);
  const fromPlayer = player ? detailsFromPlayerResponse(player) : null;
  if (fromPlayer) return fromPlayer;
  try {
    const response = await fetchImpl(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
      { signal: AbortSignal.timeout(timeoutMs) }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    if (!data.title) return null;
    return {
      videoId,
      title: data.title,
      author: data.author_name ?? null,
      description: "",
      lengthSeconds: null,
      thumbnailUrl: data.thumbnail_url ?? null,
      publishDate: null,
    };
  } catch {
    return null;
  }
}

/**
 * Fetches the video's caption track as timed segments. Prefers a human
 * English track over auto-generated, then any English, then the first track.
 * Returns an empty list when the video has no captions or YouTube declines.
 */
export async function fetchYouTubeTranscript(
  videoId: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000
): Promise<TranscriptSegment[]> {
  try {
    const payload = await fetchInnertubePlayer(videoId, fetchImpl, timeoutMs);
    if (!payload) return [];
    const tracks = payload.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    const track =
      tracks.find((item) => item.languageCode?.startsWith("en") && item.kind !== "asr") ??
      tracks.find((item) => item.languageCode?.startsWith("en")) ??
      tracks[0];
    if (!track?.baseUrl || !track.baseUrl.startsWith("https://www.youtube.com/")) return [];
    const captions = await fetchImpl(track.baseUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!captions.ok) return [];
    return parseTimedText(await captions.text());
  } catch {
    return [];
  }
}

function decodeXmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  const once = (text: string) =>
    text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity[0] === "#") {
        const code =
          entity[1] === "x" || entity[1] === "X"
            ? Number.parseInt(entity.slice(2), 16)
            : Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      return named[entity.toLowerCase()] ?? match;
    });
  // Caption text is frequently double-encoded ("&amp;#39;").
  return once(once(value));
}

/** Parses both timedtext formats: `<p t d><s>…</s></p>` (srv3) and `<text start dur>` (srv1). */
export function parseTimedText(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const push = (startMs: number, raw: string) => {
    // Drop sound tags ("[music]", "[applause]"); keep ">>" as a speaker-change marker.
    const text = decodeXmlEntities(raw.replace(/<[^>]+>/g, ""))
      .replace(/\[[^\]]{1,30}\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) segments.push({ start: startMs / 1000, text });
  };
  for (const match of xml.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const start = Number(/\bt="(\d+)"/.exec(match[1])?.[1] ?? "0");
    push(start, match[2]);
  }
  if (segments.length === 0) {
    for (const match of xml.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
      const start = Number(/\bstart="([\d.]+)"/.exec(match[1])?.[1] ?? "0") * 1000;
      push(start, match[2]);
    }
  }
  return segments;
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  return `${hours > 0 ? `${hours}:` : ""}${mm}:${String(seconds).padStart(2, "0")}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkify(text: string): string {
  return escapeHtml(text).replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`);
}

/**
 * Groups transcript segments into readable paragraphs (~`windowSeconds` each,
 * broken at sentence ends when possible) and prefixes each with its timestamp.
 */
export function transcriptToParagraphs(
  segments: TranscriptSegment[],
  windowSeconds = 60
): Array<{ start: number; text: string }> {
  const paragraphs: Array<{ start: number; text: string }> = [];
  let current: { start: number; parts: string[] } | null = null;
  for (const rawSegment of segments) {
    // A leading ">>" marks a new speaker: close the paragraph and drop the marker.
    const speakerChange = rawSegment.text.startsWith(">>");
    const segment = speakerChange
      ? { ...rawSegment, text: rawSegment.text.replace(/^>>\s*/, "") }
      : rawSegment;
    if (speakerChange && current && current.parts.length > 0) {
      paragraphs.push({ start: current.start, text: current.parts.join(" ") });
      current = null;
    }
    if (!segment.text) continue;
    if (!current) current = { start: segment.start, parts: [] };
    current.parts.push(segment.text.replace(/\s>>\s/g, " — "));
    const elapsed = segment.start - current.start;
    const sentenceEnd = /[.!?]["')\]]?$/.test(segment.text);
    if ((elapsed >= windowSeconds && sentenceEnd) || elapsed >= windowSeconds * 2) {
      paragraphs.push({ start: current.start, text: current.parts.join(" ") });
      current = null;
    }
  }
  if (current && current.parts.length > 0) {
    paragraphs.push({ start: current.start, text: current.parts.join(" ") });
  }
  return paragraphs;
}

export interface RenderedYouTubeContent {
  html: string;
  text: string;
}

/** Builds the reader body: description, then the timestamped transcript. */
export function renderYouTubeContent(
  details: YouTubeVideoDetails,
  segments: TranscriptSegment[]
): RenderedYouTubeContent {
  const html: string[] = [];
  const text: string[] = [];
  const description = details.description.trim();
  if (description) {
    html.push("<h2>Description</h2>");
    for (const paragraph of description.split(/\n{2,}/)) {
      const trimmed = paragraph.trim();
      if (!trimmed) continue;
      html.push(`<p>${linkify(trimmed).replace(/\n/g, "<br>")}</p>`);
      text.push(trimmed);
    }
  }
  const paragraphs = transcriptToParagraphs(segments);
  if (paragraphs.length > 0) {
    html.push("<h2>Transcript</h2>");
    for (const paragraph of paragraphs) {
      const stamp = formatDuration(paragraph.start);
      html.push(
        `<p><a href="https://www.youtube.com/watch?v=${details.videoId}&t=${Math.floor(paragraph.start)}s">${stamp}</a> ${escapeHtml(paragraph.text)}</p>`
      );
      text.push(paragraph.text);
    }
  }
  return { html: html.join("\n"), text: text.join("\n\n") };
}
