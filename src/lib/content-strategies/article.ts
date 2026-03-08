import type { ContentStrategy } from "./types";

export const ArticleStrategy: ContentStrategy = {
  contentType: "article",
  extractContent: true,
  generateAISummary: true,
  enrichMetadata: async () => ({}),
  card: { showPlayOverlay: false, summaryMaxChars: 200 },
  detail: {
    showEmbedPlayer: false,
    showAISummary: true,
    showReaderContent: true,
    showTweetRenderer: false,
  },
};
