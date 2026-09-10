import type { AuthContext } from "@/lib/contracts/tenant-context";
import { parseAuthContext } from "@/lib/contracts/tenant-context";
import type { RepositorySet } from "@/lib/repositories/ports";
import { createDegradedSummary } from "./artifacts";
import { chunkContent, estimateTokenCount } from "./chunking";
import { createContentVersionIdentity, sha256 } from "./content-identity";

export const CAPTURE_EXTRACTOR_VERSION = "capture-v1";

type CaptureKnowledgeRepositories = Pick<
  RepositorySet,
  "items" | "contentVersions" | "contentChunks" | "intelligenceArtifacts"
>;

/**
 * Makes a newly captured item immediately available to reader intelligence,
 * keyword search, and grounded answers. Every identity is deterministic so a
 * queue redelivery or duplicate capture can safely replay this work.
 */
export async function indexCapturedItem(input: {
  context: AuthContext;
  repositories: CaptureKnowledgeRepositories;
  itemId: string;
  now?: () => Date;
}) {
  parseAuthContext(input.context);
  const item = await input.repositories.items.findById(input.itemId);
  if (!item || item.processingStatus !== "ready") return undefined;

  const fullContent = item.fullContent?.trim();
  const content = fullContent || item.summary.trim();
  if (!content) return undefined;

  const createdAt = (input.now ?? (() => new Date()))().toISOString();
  const identity = createContentVersionIdentity({
    itemId: item.id,
    content,
    extractorVersion: CAPTURE_EXTRACTOR_VERSION,
  });
  const version = (
    await input.repositories.contentVersions.create({
      ...identity,
      itemId: item.id,
      extractorVersion: CAPTURE_EXTRACTOR_VERSION,
      source: fullContent ? "full_content" : "summary",
      content,
      characterCount: content.length,
      tokenCount: estimateTokenCount(content),
      createdAt,
    })
  ).record;

  const chunks = chunkContent(version.id, version.content).map((chunk) => ({
    ...chunk,
    itemId: item.id,
    embeddingStatus: "unconfigured" as const,
    createdAt,
  }));
  const chunkResult = await input.repositories.contentChunks.insertMany(chunks);

  const summary = createDegradedSummary({ title: item.title, content });
  if (summary.content) {
    const artifactId = `art_${sha256(
      JSON.stringify(["capture", version.id, summary.contentHash])
    ).slice("sha256:".length, 39)}`;
    await input.repositories.intelligenceArtifacts.publish({
      id: artifactId,
      itemId: item.id,
      contentVersionId: version.id,
      artifactType: "brief_summary",
      status: "degraded",
      content: summary.content,
      contentHash: summary.contentHash,
      provenance: "deterministic_fallback",
      promptVersion: "extractive-v1",
      makeCurrent: false,
      makeCurrentIfNone: true,
      metadata: { reason: summary.reason, sentenceCount: summary.sentenceCount },
      errorCode: summary.reason,
      errorMessage: "Text generation was unavailable; this summary is extractive",
      createdAt,
      updatedAt: createdAt,
      completedAt: createdAt,
    });
  }

  return { contentVersionId: version.id, chunkCount: chunkResult.records.length };
}
