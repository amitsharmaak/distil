import { ArticleStrategy } from "./article";
import { YouTubeStrategy } from "./youtube";
import { TweetStrategy } from "./tweet";
import type { ContentStrategy } from "./types";

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
