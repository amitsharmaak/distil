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

/**
 * Innertube clients tried in order. YouTube answers different clients
 * differently per source IP: a laptop gets everything from ANDROID, while a
 * datacenter egress may be refused by some and served by others.
 */
const INNERTUBE_CLIENTS: Array<{
  name: string;
  context: Record<string, unknown>;
  headers?: Record<string, string>;
}> = [
  {
    name: "ANDROID",
    context: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30, hl: "en" },
    headers: { "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip" },
  },
  {
    name: "IOS",
    context: {
      clientName: "IOS",
      clientVersion: "20.10.4",
      deviceMake: "Apple",
      deviceModel: "iPhone16,2",
      osName: "iPhone",
      osVersion: "18.3.2.22D82",
      hl: "en",
    },
    headers: {
      "User-Agent": "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
    },
  },
  {
    name: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
    context: { clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientVersion: "2.0", hl: "en" },
  },
  {
    name: "WEB",
    context: { clientName: "WEB", clientVersion: "2.20250312.04.00", hl: "en" },
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      "X-YouTube-Client-Name": "1",
      "X-YouTube-Client-Version": "2.20250312.04.00",
    },
  },
];

interface InnertubePlayerResponse extends Record<string, unknown> {
  playabilityStatus?: { status?: string; reason?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: Array<{ baseUrl?: string; languageCode?: string; kind?: string }>;
    };
  };
}

export interface InnertubeAttempt {
  client: string;
  outcome: string;
}

/**
 * Calls the innertube player endpoint with each client until one returns a
 * response that satisfies `accept`. `attempts` collects what each client said,
 * for the caller to log — Production behaviour per client is only learnable
 * from real captures.
 */
async function fetchInnertubePlayer(
  videoId: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  accept: (payload: InnertubePlayerResponse) => boolean,
  attempts: InnertubeAttempt[] = []
): Promise<InnertubePlayerResponse | null> {
  for (const client of INNERTUBE_CLIENTS) {
    try {
      const response = await fetchImpl(INNERTUBE_PLAYER, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...client.headers },
        body: JSON.stringify({ videoId, context: { client: client.context } }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        attempts.push({ client: client.name, outcome: `http ${response.status}` });
        continue;
      }
      const payload = (await response.json()) as InnertubePlayerResponse;
      if (accept(payload)) {
        attempts.push({ client: client.name, outcome: "ok" });
        return payload;
      }
      attempts.push({
        client: client.name,
        outcome: payload.playabilityStatus?.status ?? "no usable payload",
      });
    } catch (error) {
      attempts.push({
        client: client.name,
        outcome: error instanceof Error ? error.name : "error",
      });
    }
  }
  return null;
}

const hasVideoDetails = (payload: InnertubePlayerResponse) =>
  detailsFromPlayerResponse(payload) !== null;
const hasCaptions = (payload: InnertubePlayerResponse) =>
  (payload.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length ?? 0) > 0;

/** Official Data API v3 — reliable from any egress, needs an API key. */
async function fetchDataApiDetails(
  videoId: string,
  apiKey: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<YouTubeVideoDetails | null> {
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("id", videoId);
    url.searchParams.set("key", apiKey);
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      items?: Array<{
        snippet?: {
          title?: string;
          description?: string;
          channelTitle?: string;
          publishedAt?: string;
          thumbnails?: Record<string, { url?: string; width?: number }>;
        };
        contentDetails?: { duration?: string };
      }>;
    };
    const item = data.items?.[0];
    if (!item?.snippet?.title) return null;
    const thumbnails = Object.values(item.snippet.thumbnails ?? {});
    const largest = thumbnails.reduce<{ url?: string; width?: number } | undefined>(
      (best, thumb) => ((thumb.width ?? 0) > (best?.width ?? -1) ? thumb : best),
      undefined
    );
    return {
      videoId,
      title: item.snippet.title,
      author: item.snippet.channelTitle ?? null,
      description: item.snippet.description ?? "",
      lengthSeconds: parseIsoDuration(item.contentDetails?.duration),
      thumbnailUrl: largest?.url ?? null,
      publishDate: item.snippet.publishedAt ?? null,
    };
  } catch {
    return null;
  }
}

/** ISO 8601 duration ("PT28M24S") to seconds. */
export function parseIsoDuration(value: string | undefined): number | null {
  const match = value?.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match.map((part) => Number(part ?? 0));
  const total = days * 86400 + hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

/**
 * Video details when the watch page did not carry them (datacenter egress
 * gets a consent or bot interstitial): innertube first, then oEmbed, which
 * only knows title, channel and thumbnail.
 */
export async function fetchYouTubeVideoDetails(
  videoId: string,
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    apiKey?: string;
    attempts?: InnertubeAttempt[];
  } = {}
): Promise<YouTubeVideoDetails | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const attempts = options.attempts ?? [];
  if (options.apiKey) {
    const fromApi = await fetchDataApiDetails(videoId, options.apiKey, fetchImpl, timeoutMs);
    attempts.push({ client: "data-api", outcome: fromApi ? "ok" : "no result" });
    if (fromApi) return fromApi;
  }
  const player = await fetchInnertubePlayer(
    videoId,
    fetchImpl,
    timeoutMs,
    hasVideoDetails,
    attempts
  );
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
    attempts.push({ client: "oembed", outcome: data.title ? "ok" : "no result" });
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
    attempts.push({ client: "oembed", outcome: "error" });
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
  timeoutMs = 10_000,
  attempts: InnertubeAttempt[] = []
): Promise<TranscriptSegment[]> {
  try {
    const payload = await fetchInnertubePlayer(
      videoId,
      fetchImpl,
      timeoutMs,
      hasCaptions,
      attempts
    );
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
