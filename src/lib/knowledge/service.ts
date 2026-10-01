import type { RepositorySet } from "@/lib/repositories/ports";
import { parseAuthContext, type AuthContext } from "@/lib/contracts/tenant-context";

export class KnowledgeServiceError extends Error {
  constructor(
    readonly code: "ITEM_NOT_FOUND",
    readonly status: 404,
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
