import type { RepositorySet } from "@/lib/repositories/ports";
import { ReaderError } from "./reader-service";
import {
  extractYouTubeId,
  fetchYouTubeTranscript,
  renderYouTubeContent,
  type TranscriptSegment,
  type YouTubeVideoDetails,
} from "@/lib/youtube";

export const TRANSCRIPT_MEDIA_KEY = "transcript";

type VideoMedia = { type?: string; platform?: string; videoId?: string; transcript?: boolean };

/** The YouTube video an item can load a transcript for: its own URL, or a linked video. */
export function linkedYouTubeId(item: { url: string; detectedMedia?: unknown[] }): string | null {
  const own = extractYouTubeId(item.url);
  if (own) return own;
  const linked = (item.detectedMedia as VideoMedia[] | undefined)?.find(
    (media) => media.type === "video" && media.platform === "youtube" && media.videoId
  );
  return linked?.videoId ?? null;
}

/** True when the item's stored body already contains a loaded transcript. */
export function hasTranscript(item: { detectedMedia?: unknown[] }): boolean {
  return (
    (item.detectedMedia as VideoMedia[] | undefined)?.some(
      (media) => media.type === "video" && media.platform === "youtube" && media.transcript === true
    ) ?? false
  );
}

export interface LoadTranscriptDependencies {
  fetchTranscript?: (videoId: string) => Promise<TranscriptSegment[]>;
}

/**
 * Loads a YouTube video's transcript on demand, rewrites the item body as
 * Description + Transcript and drops any summaries built from the description
 * alone so the next request regenerates them from the transcript.
 */
export async function loadVideoTranscript(
  repositories: Pick<RepositorySet, "items" | "summaries">,
  itemId: string,
  dependencies: LoadTranscriptDependencies = {}
): Promise<{ paragraphs: number }> {
  const item = await repositories.items.findById(itemId);
  if (!item) throw new ReaderError("ITEM_NOT_FOUND", 404, `Item with id "${itemId}" was not found`);
  const videoId = linkedYouTubeId(item);
  if (!videoId) {
    throw new ReaderError(
      "INVALID_REQUEST",
      400,
      "Transcripts are only available for YouTube videos"
    );
  }
  if (hasTranscript(item)) return { paragraphs: 0 };

  const segments = await (dependencies.fetchTranscript ?? fetchYouTubeTranscript)(videoId);
  if (segments.length === 0) {
    throw new ReaderError("TRANSCRIPT_UNAVAILABLE", 404, "This video has no captions to load");
  }

  // Rebuild from the stored description (the fullContent's Description section)
  // rather than refetching the watch page.
  const details: YouTubeVideoDetails = {
    videoId,
    title: item.title,
    author: item.author ?? null,
    description: descriptionFromBody(item.fullContent),
    lengthSeconds: null,
    thumbnailUrl: item.thumbnailUrl ?? null,
    publishDate: null,
  };
  const rendered = renderYouTubeContent(details, segments);
  const media = ((item.detectedMedia as VideoMedia[] | undefined) ?? []).map((entry) =>
    entry.type === "video" && entry.platform === "youtube" ? { ...entry, transcript: true } : entry
  );
  if (!media.some((entry) => entry.type === "video" && entry.platform === "youtube")) {
    media.push({ type: "video", platform: "youtube", videoId, transcript: true });
  }
  await repositories.items.update(itemId, { fullContent: rendered.html, detectedMedia: media });
  await repositories.summaries.deleteForItem(itemId);
  return { paragraphs: rendered.html.split("<p>").length - 1 };
}

/** Recovers the plain description paragraphs from a rendered video body. */
function descriptionFromBody(html: string | undefined): string {
  if (!html) return "";
  const section = html.split("<h2>Transcript</h2>")[0].replace("<h2>Description</h2>", "");
  return section
    .split(/<\/p>/)
    .map((paragraph) =>
      paragraph
        .replace(/<br>/g, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .trim()
    )
    .filter(Boolean)
    .join("\n\n");
}
