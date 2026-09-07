import { sha256 } from "./content-identity";

export const ARTIFACT_TYPES = ["brief_summary", "detailed_summary", "claims"] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const ARTIFACT_STATUSES = ["pending", "ready", "degraded", "failed", "stale"] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

export const ARTIFACT_PROVENANCE = [
  "generated",
  "deterministic_fallback",
  "legacy_unverified",
] as const;
export type ArtifactProvenance = (typeof ARTIFACT_PROVENANCE)[number];

export type ArtifactFailureReason =
  | "generation_unavailable"
  | "invalid_output"
  | "insufficient_content"
  | "provider_error"
  | "budget_exceeded";

export interface IntelligenceArtifact {
  id: string;
  itemId: string;
  contentVersionId: string;
  artifactType: ArtifactType;
  version: number;
  status: ArtifactStatus;
  content?: string;
  contentHash?: string;
  provenance: ArtifactProvenance;
  promptVersion?: string;
  provider?: string;
  model?: string;
  isCurrent: boolean;
  supersedesArtifactId?: string;
  metadata: Record<string, unknown>;
  errorCode?: ArtifactFailureReason;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

const artifactTransitions: Readonly<Record<ArtifactStatus, readonly ArtifactStatus[]>> = {
  pending: ["ready", "degraded", "failed"],
  ready: ["stale"],
  degraded: ["stale"],
  failed: [],
  stale: [],
};

export function canTransitionArtifact(from: ArtifactStatus, to: ArtifactStatus): boolean {
  return artifactTransitions[from].includes(to);
}

export interface DegradedSummaryInput {
  title: string;
  content: string;
}

export interface DegradedSummary {
  status: "degraded";
  reason: "generation_unavailable";
  content: string;
  contentHash: string;
  sentenceCount: number;
}

/** Creates the deterministic no-provider fallback: title plus up to two source sentences. */
export function createDegradedSummary(input: DegradedSummaryInput): DegradedSummary {
  const title = normalizeWhitespace(input.title);
  const sentences = extractUsableSentences(input.content).slice(0, 2);
  const content = [title, ...sentences.filter((sentence) => sentence !== title)]
    .filter(Boolean)
    .join("\n\n");

  return {
    status: "degraded",
    reason: "generation_unavailable",
    content,
    contentHash: sha256(content),
    sentenceCount: sentences.length,
  };
}

function extractUsableSentences(content: string): string[] {
  const normalized = normalizeWhitespace(content);
  if (!normalized) return [];

  const matches = normalized.match(/[^.!?。！？]+(?:[.!?。！？]+|$)/gu) ?? [];
  return matches.map(normalizeWhitespace).filter((sentence) => /[\p{L}\p{N}]/u.test(sentence));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}
