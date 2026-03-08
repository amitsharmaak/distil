import type { OGData } from "../og";

export interface EnrichedMetadata {
  title?: string;
  author?: string;
  publication?: string;
  thumbnailUrl?: string;
  duration?: string;
  summary?: string;
}

export interface ContentStrategy {
  readonly contentType: "article" | "video" | "podcast";
  readonly extractContent: boolean;
  readonly generateAISummary: boolean;
  enrichMetadata(url: string, ogData: OGData): Promise<EnrichedMetadata>;
  card: {
    showPlayOverlay: boolean;
    summaryMaxChars: number;
  };
  detail: {
    showEmbedPlayer: boolean;
    showAISummary: boolean;
    showReaderContent: boolean;
    showTweetRenderer: boolean;
  };
}
