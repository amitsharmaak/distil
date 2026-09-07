/**
 * Temporary UI contract for Phase 2. These types intentionally do not mirror
 * persistence models: the platform stream will provide the final API types.
 */
export type KnowledgeItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  href: string;
  isRead?: boolean;
  reason: string;
};

export type AnnotationFixture = {
  id: string;
  quote: string;
  comment?: string;
  state: "active" | "orphaned";
};

export type IntelligenceState = "ready" | "degraded" | "pending";

export type ReaderKnowledgeFixture = {
  itemId: string;
  title: string;
  source: string;
  body: string[];
  note: string;
  collections: { id: string; name: string; selected: boolean }[];
  annotations: AnnotationFixture[];
  intelligenceState: IntelligenceState;
  degradedReason?: string;
  archived?: boolean;
};
