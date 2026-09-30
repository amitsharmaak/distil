import { z } from "zod";

import { sha256 } from "@/lib/knowledge/content-identity";
import type { RepositorySet } from "@/lib/repositories/ports";
import { parseAuthContext, type AuthContext } from "@/lib/contracts/tenant-context";
import type { ArtifactType } from "./artifacts";

export const regenerateSummarySchema = z
  .object({
    length: z.enum(["brief", "detailed"]).default("brief"),
    idempotencyKey: z.string().trim().min(1).max(128),
  })
  .strict();

export class KnowledgeServiceError extends Error {
  constructor(
    readonly code: "INVALID_REQUEST" | "ITEM_NOT_FOUND" | "CONTENT_NOT_READY",
    readonly status: 400 | 404 | 409,
    message: string
  ) {
    super(message);
    this.name = "KnowledgeServiceError";
  }
}

export async function getItemIntelligence(
  context: AuthContext,
  repositories: RepositorySet,
  itemId: string
) {
  parseAuthContext(context);
  const item = await repositories.items.findById(itemId);
  if (!item) throw new KnowledgeServiceError("ITEM_NOT_FOUND", 404, "Item was not found");
  // Two waves of independent reads: the version and artifact history depend
  // only on the item; chunk metadata and claims depend on that first wave.
  const [contentVersion, artifacts] = await Promise.all([
    repositories.contentVersions.findLatestForItem(itemId),
    repositories.intelligenceArtifacts.listForItem(itemId),
  ]);
  const currentClaimsArtifact = artifacts.find(
    (artifact) => artifact.artifactType === "claims" && artifact.isCurrent
  );
  const [chunks, claims] = await Promise.all([
    contentVersion
      ? repositories.contentChunks.listMetadataForContentVersion(contentVersion.id)
      : Promise.resolve([]),
    currentClaimsArtifact
      ? repositories.claims.listForArtifact(currentClaimsArtifact.id)
      : Promise.resolve([]),
  ]);
  return {
    item: { id: item.id, title: item.title, url: item.url },
    contentVersion: contentVersion
      ? {
          id: contentVersion.id,
          version: contentVersion.version,
          contentHash: contentVersion.contentHash,
          extractorVersion: contentVersion.extractorVersion,
          source: contentVersion.source,
          characterCount: contentVersion.characterCount,
          tokenCount: contentVersion.tokenCount,
          createdAt: contentVersion.createdAt,
        }
      : null,
    chunks: chunks.map((chunk) => ({
      id: chunk.id,
      ordinal: chunk.ordinal,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      tokenCount: chunk.tokenCount,
      embeddingStatus: chunk.embeddingStatus,
    })),
    artifacts,
    claims,
  };
}

export async function enqueueSummaryRegeneration(
  context: AuthContext,
  repositories: RepositorySet,
  itemId: string,
  input: z.infer<typeof regenerateSummarySchema>,
  now = new Date()
) {
  const tenant = parseAuthContext(context);
  const item = await repositories.items.findById(itemId);
  if (!item) throw new KnowledgeServiceError("ITEM_NOT_FOUND", 404, "Item was not found");
  const contentVersion = await repositories.contentVersions.findLatestForItem(itemId);
  if (!contentVersion) {
    throw new KnowledgeServiceError(
      "CONTENT_NOT_READY",
      409,
      "The item does not have versioned source content"
    );
  }
  const artifactType: ArtifactType =
    input.length === "detailed" ? "detailed_summary" : "brief_summary";
  const identity = sha256(
    JSON.stringify([
      "summary-regeneration",
      tenant.userId,
      itemId,
      artifactType,
      input.idempotencyKey,
    ])
  ).slice("sha256:".length, 39);
  const artifactId = `art_${identity}`;
  const jobId = `ksj_${identity}`;
  const traceId = tenant.requestId;
  const at = now.toISOString();
  const artifact = (
    await repositories.intelligenceArtifacts.publish({
      id: artifactId,
      itemId,
      contentVersionId: contentVersion.id,
      artifactType,
      status: "pending",
      provenance: "generated",
      promptVersion: "grounded-summary-v1",
      makeCurrent: false,
      metadata: { jobId, traceId, requestedLength: input.length },
      createdAt: at,
      updatedAt: at,
    })
  ).record;
  await repositories.jobs.enqueue({
    id: jobId,
    jobType: "regenerate_intelligence_summary",
    payload: JSON.stringify({
      userId: tenant.userId,
      itemId,
      contentVersionId: contentVersion.id,
      artifactId,
      artifactType,
      jobId,
      traceId,
    }),
    priority: 3,
    maxRetries: 3,
  });
  return { artifact, jobId };
}
