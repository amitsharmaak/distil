import type { ContentStrategy, EnrichedMetadata } from "./types";

export const YouTubeStrategy: ContentStrategy = {
  contentType: "video",
  extractContent: false,
  generateAISummary: false,
  enrichMetadata: async (url: string): Promise<EnrichedMetadata> => {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return {};
      const data = (await res.json()) as {
        author_name?: string;
        thumbnail_url?: string;
      };
      return {
        author: data.author_name ?? undefined,
        thumbnailUrl: data.thumbnail_url ?? undefined,
      };
    } catch {
      return {};
    }
  },
  card: { showPlayOverlay: true, summaryMaxChars: 150 },
  detail: {
    showEmbedPlayer: true,
    showAISummary: false,
    showReaderContent: false,
    showTweetRenderer: false,
  },
};
