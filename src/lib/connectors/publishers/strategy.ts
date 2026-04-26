import "server-only";

import { ArticleStrategy } from "../../content-strategies/article";
import type { ContentStrategy } from "../../content-strategies/types";
import type { ExtractedContentResult } from "../../intelligence/types";
import { fetchArticle } from "./fetcher";
import { findByUrl } from "./registry";

export const PublisherStrategy: ContentStrategy & {
  extract: (url: string) => Promise<ExtractedContentResult>;
} = {
  contentType: ArticleStrategy.contentType,
  extractContent: ArticleStrategy.extractContent,
  generateAISummary: ArticleStrategy.generateAISummary,
  enrichMetadata: ArticleStrategy.enrichMetadata,
  card: ArticleStrategy.card,
  detail: ArticleStrategy.detail,

  async extract(url: string): Promise<ExtractedContentResult> {
    const publisher = findByUrl(url);
    if (!publisher) {
      throw new Error(`No publisher matches URL: ${url}`);
    }
    return fetchArticle(publisher, url);
  },
};
