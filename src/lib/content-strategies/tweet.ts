import type { ContentStrategy } from "./types";

export const TweetStrategy: ContentStrategy = {
  contentType: "article",
  extractContent: false,
  generateAISummary: false,
  enrichMetadata: async () => ({}),
  card: { showPlayOverlay: false, summaryMaxChars: 280 },
  detail: {
    showEmbedPlayer: false,
    showAISummary: false,
    showReaderContent: false,
    showTweetRenderer: true,
  },
};
