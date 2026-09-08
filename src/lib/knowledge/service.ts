import { z } from "zod";

import { sha256 } from "@/lib/knowledge/content-identity";
import type { RepositorySet } from "@/lib/repositories/ports";
import { parseAuthContext, type AuthContext } from "@/lib/contracts/tenant-context";
import type { ArtifactType } from "./artifacts";
import {
  type PassageFilters,
  type PassageSearchResult,
  type PassageSearchStore,
  type RetrievalDegradation,
  UNPINNED_SEMANTIC_DEGRADATION,
} from "./retrieval";

export const answerRequestSchema = z
  .object({
    query: z.string().trim().min(2).max(2_000),
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(8_000),
          })
          .strict()
      )
      .max(6)
      .default([]),
    intent: z.enum(["specific", "general"]).optional(),
    filters: z
      .object({
        read: z.boolean().optional(),
        archive: z.enum(["exclude", "only", "include"]).optional(),
        topics: z.array(z.string().trim().min(1).max(120)).max(25).optional(),
        sources: z.array(z.string().trim().min(1).max(80)).max(25).optional(),
        contentTypes: z.array(z.string().trim().min(1).max(80)).max(25).optional(),
        priorities: z
          .array(z.enum(["high", "medium", "low"]))
          .max(3)
          .optional(),
        collectionIds: z.array(z.string().trim().min(1).max(160)).max(25).optional(),
        dateFrom: z.string().datetime().optional(),
        dateTo: z.string().datetime().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const regenerateSummarySchema = z
  .object({
    length: z.enum(["brief", "detailed"]).default("brief"),
    idempotencyKey: z.string().trim().min(1).max(128),
  })
  .strict();

export type AnswerRequest = z.infer<typeof answerRequestSchema>;
export type AnswerIntent = "specific" | "general";

export interface GeneratedCitation {
  itemId: string;
  chunkId: string;
  exactExcerpt: string;
}

export interface GeneratedGroundedAnswer {
  answer: string;
  citations: GeneratedCitation[];
}

export type AnswerGenerator = (input: {
  query: string;
  intent: AnswerIntent;
  messages: AnswerRequest["messages"];
  passages: PassageSearchResult[];
}) => Promise<unknown>;

export interface ValidatedCitation extends GeneratedCitation {
  id: string;
  title: string;
  url: string;
  sourceType: string;
}

export interface GroundedAnswerResponse {
  status: "ready" | "degraded" | "abstained";
  intent: AnswerIntent;
  answer: string;
  citations: ValidatedCitation[];
  passagesUsed: number;
  retrievalMode: PassageSearchResult["retrievalMode"] | "keyword";
  degradation: RetrievalDegradation[];
}

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

const generatedAnswerSchema = z
  .object({
    answer: z.string().trim().min(1).max(40_000),
    citations: z
      .array(
        z
          .object({
            itemId: z.string().min(1),
            chunkId: z.string().min(1),
            exactExcerpt: z.string().trim().min(1).max(4_000),
          })
          .strict()
      )
      .max(20),
  })
  .strict();

const GENERAL_QUERY =
  /\b(brief|digest|overview|summari[sz]e|catch me up|what(?:'s| is) new|recent|unread|recommend|highlights?|my library)\b/i;
const MIN_SPECIFIC_SCORE = 0.01;

export function classifyAnswerIntent(query: string): AnswerIntent {
  return GENERAL_QUERY.test(query) ? "general" : "specific";
}

export function validateGeneratedCitations(
  generated: GeneratedGroundedAnswer,
  passages: PassageSearchResult[]
): ValidatedCitation[] {
  const passageByIdentity = new Map(
    passages.map((passage) => [`${passage.itemId}\u0000${passage.chunkId}`, passage])
  );
  const seen = new Set<string>();
  const citations: ValidatedCitation[] = [];
  for (const citation of generated.citations) {
    const passage = passageByIdentity.get(`${citation.itemId}\u0000${citation.chunkId}`);
    if (!passage || !passage.excerpt.includes(citation.exactExcerpt)) continue;
    const key = `${citation.itemId}\u0000${citation.chunkId}\u0000${citation.exactExcerpt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({
      ...citation,
      id: `citation-${citations.length + 1}`,
      title: passage.title,
      url: passage.url,
      sourceType: passage.sourceType,
    });
  }
  return citations;
}

function fallbackAnswer(
  query: string,
  intent: AnswerIntent,
  passages: PassageSearchResult[],
  degradation: RetrievalDegradation[]
): GroundedAnswerResponse {
  const selected = passages.slice(0, 5);
  const citations = selected.map((passage, index) => ({
    id: `citation-${index + 1}`,
    itemId: passage.itemId,
    chunkId: passage.chunkId,
    exactExcerpt: passage.excerpt,
    title: passage.title,
    url: passage.url,
    sourceType: passage.sourceType,
  }));
  const evidence = selected
    .map(
      (passage, index) => `[${index + 1}] ${passage.title}: ${passage.excerpt.slice(0, 360).trim()}`
    )
    .join("\n\n");
  return {
    status: "degraded",
    intent,
    answer: `A generated answer is unavailable. These are the strongest saved passages for “${query}”:\n\n${evidence}`,
    citations,
    passagesUsed: selected.length,
    retrievalMode: selected[0]?.retrievalMode ?? "keyword",
    degradation,
  };
}

export async function answerFromKnowledge(input: {
  context: AuthContext;
  request: AnswerRequest;
  store: PassageSearchStore;
  generator?: AnswerGenerator;
}): Promise<GroundedAnswerResponse> {
  parseAuthContext(input.context);
  const query = input.request.query.trim();
  const intent = input.request.intent ?? classifyAnswerIntent(query);
  const filters = input.request.filters ?? {};
  let passages = await input.store.searchKeyword({ query, ...filters, limit: 10 });
  if (intent === "specific") {
    passages = passages.filter((passage) => passage.score >= MIN_SPECIFIC_SCORE);
    if (passages.length === 0) {
      return {
        status: "abstained",
        intent,
        answer: "I could not find enough relevant evidence in your saved knowledge to answer that.",
        citations: [],
        passagesUsed: 0,
        retrievalMode: "keyword",
        degradation: [UNPINNED_SEMANTIC_DEGRADATION],
      };
    }
  } else if (passages.length === 0) {
    passages = await input.store.listRecent({ ...filters, limit: 10 });
  }

  if (passages.length === 0) {
    return {
      status: "abstained",
      intent,
      answer: "I could not find saved passages that match this request.",
      citations: [],
      passagesUsed: 0,
      retrievalMode: "keyword",
      degradation: [UNPINNED_SEMANTIC_DEGRADATION],
    };
  }

  const generationUnavailable: RetrievalDegradation = {
    code: "GENERATION_UNAVAILABLE",
    reason: "Grounded answer generation is unavailable; ranked source passages are shown instead",
  };
  const degradation = [UNPINNED_SEMANTIC_DEGRADATION, generationUnavailable];
  if (!input.generator) return fallbackAnswer(query, intent, passages, degradation);

  try {
    const parsed = generatedAnswerSchema.safeParse(
      await input.generator({
        query,
        intent,
        messages: input.request.messages.slice(-6),
        passages,
      })
    );
    if (!parsed.success) return fallbackAnswer(query, intent, passages, degradation);
    const citations = validateGeneratedCitations(parsed.data, passages);
    if (citations.length === 0) return fallbackAnswer(query, intent, passages, degradation);
    return {
      status: "ready",
      intent,
      answer: parsed.data.answer,
      citations,
      passagesUsed: passages.length,
      retrievalMode: passages[0].retrievalMode,
      degradation: [UNPINNED_SEMANTIC_DEGRADATION],
    };
  } catch {
    return fallbackAnswer(query, intent, passages, degradation);
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
  const contentVersion = await repositories.contentVersions.findLatestForItem(itemId);
  const artifacts = await repositories.intelligenceArtifacts.listForItem(itemId);
  const chunks = contentVersion
    ? await repositories.contentChunks.listForContentVersion(contentVersion.id)
    : [];
  const currentClaimsArtifact = artifacts.find(
    (artifact) => artifact.artifactType === "claims" && artifact.isCurrent
  );
  const claims = currentClaimsArtifact
    ? await repositories.claims.listForArtifact(currentClaimsArtifact.id)
    : [];
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

export function assertDateRange(filters: PassageFilters): void {
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
    throw new KnowledgeServiceError("INVALID_REQUEST", 400, "dateFrom must not be after dateTo");
  }
}
