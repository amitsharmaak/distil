import type { ArtifactStatus, ArtifactType } from "./artifacts";

export type ContentVersionSource = "full_content" | "summary" | "raw_content";
export type EmbeddingStatus = "unconfigured" | "pending" | "ready" | "failed" | "stale";
export type KnowledgeBackfillType =
  | "content_versions"
  | "chunks"
  | "legacy_artifacts"
  | "embeddings";
export type KnowledgeBackfillStatus = "pending" | "running" | "completed" | "failed";

export interface ItemContentVersion {
  id: string;
  itemId: string;
  version: number;
  contentHash: string;
  extractorVersion: string;
  source: ContentVersionSource;
  content: string;
  characterCount: number;
  tokenCount: number;
  createdAt: string;
}

export interface ContentChunkRecord {
  id: string;
  contentVersionId: string;
  itemId: string;
  ordinal: number;
  content: string;
  contentHash: string;
  startOffset: number;
  endOffset: number;
  tokenCount: number;
  embeddingModel?: string;
  embeddingDimensions?: number;
  embeddingStatus: EmbeddingStatus;
  embeddingError?: string;
  embeddingUpdatedAt?: string;
  embeddedAt?: string;
  createdAt: string;
}

export interface GroundedClaim {
  id: string;
  artifactId: string;
  ordinal: number;
  claim: string;
  claimHash: string;
  confidence?: number;
  evidence: ClaimEvidence[];
}

export interface ClaimEvidence {
  claimId: string;
  chunkId: string;
  /** UTF-16 offsets relative to the chunk content, matching JavaScript String#slice. */
  startOffset: number;
  endOffset: number;
  exactExcerpt: string;
  evidenceHash: string;
}

export interface ArtifactReference {
  id: string;
  itemId: string;
  contentVersionId: string;
  artifactType: ArtifactType;
  version: number;
  status: ArtifactStatus;
}

export interface KnowledgeBackfillCheckpoint {
  jobKey: string;
  jobType: KnowledgeBackfillType;
  status: KnowledgeBackfillStatus;
  cursor?: string;
  checkpoint: Record<string, unknown>;
  processedCount: number;
  failedCount: number;
  attempt: number;
  lastError?: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}
