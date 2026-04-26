import { ArticleStrategy } from "./article";
import { YouTubeStrategy } from "./youtube";
import { TweetStrategy } from "./tweet";
import type { ContentStrategy } from "./types";

// Publisher routing (authenticated paywall fetchers) lives in the server-only
// intelligence/extractor pipeline. We deliberately do NOT import publisher
// modules here — they pull in playwright, which must never reach client bundles.
export function detectStrategy(url: string): ContentStrategy {
  if (/youtube\.com\/watch|youtu\.be\//.test(url)) {
    return YouTubeStrategy;
  }
  if (/^https?:\/\/(www\.)?(twitter|x)\.com/.test(url)) {
    return TweetStrategy;
  }
  return ArticleStrategy;
}

export { ArticleStrategy, YouTubeStrategy, TweetStrategy };
export type { ContentStrategy, EnrichedMetadata } from "./types";
