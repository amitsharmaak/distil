import type {
  ContentChunkRepository,
  ContentVersionRepository,
  IntelligenceArtifactRepository,
  JobQueueRepository,
  KnowledgeBackfillRepository,
  RepositorySet,
} from "@/lib/repositories/ports";
import { createDegradedSummary } from "./artifacts";
import { createInitialBackfillCheckpoint } from "./backfill";
import { chunkContent, estimateTokenCount } from "./chunking";
import { createContentVersionIdentity, sha256 } from "./content-identity";
import type {
  ContentChunkRecord,
  KnowledgeBackfillCheckpoint,
  KnowledgeBackfillType,
} from "./types";

export const KNOWLEDGE_BACKFILL_QUEUE_JOB = "knowledge_backfill";
export const DEFAULT_KNOWLEDGE_BATCH_SIZE = 25;
export const MAX_KNOWLEDGE_BATCH_SIZE = 100;
export const BACKFILL_EXTRACTOR_VERSION = "phase2-backfill-v1";

export type KnowledgeBackfillKind =
  | "content_versions"
  | "chunks"
  | "legacy_artifacts"
  | "degraded_summaries";

export interface KnowledgeBackfillJobPayload {
  jobKey: string;
  kind: KnowledgeBackfillKind;
  batchSize: number;
  extractorVersion?: string;
}

export interface KnowledgeBackfillDependencies {
  contentVersions: ContentVersionRepository;
  contentChunks: ContentChunkRepository;
  intelligenceArtifacts: IntelligenceArtifactRepository;
  knowledgeBackfills: KnowledgeBackfillRepository;
  jobs: JobQueueRepository;
  now?: () => Date;
}

export type KnowledgeBackfillRepositories = Pick<
  RepositorySet,
  "contentVersions" | "contentChunks" | "intelligenceArtifacts" | "knowledgeBackfills" | "jobs"
>;

const backfillTypeFor = (kind: KnowledgeBackfillKind): KnowledgeBackfillType =>
  kind === "degraded_summaries" ? "legacy_artifacts" : kind;

const defaultScopeFor = (kind: KnowledgeBackfillKind): string =>
  kind === "degraded_summaries" ? "degraded-summaries:v1" : `${kind.replaceAll("_", "-")}:v1`;

const queueJobId = (jobKey: string, cursor: string | undefined, attempt: number): string =>
  `kbj_${sha256(JSON.stringify([jobKey, cursor ?? null, attempt])).slice("sha256:".length, 39)}`;

function boundedBatchSize(value: number | undefined): number {
  const batchSize = value ?? DEFAULT_KNOWLEDGE_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_KNOWLEDGE_BATCH_SIZE) {
    throw new Error(
      `Knowledge backfill batch size must be between 1 and ${MAX_KNOWLEDGE_BATCH_SIZE}`
    );
  }
  return batchSize;
}

function parsePayload(payload: unknown): KnowledgeBackfillJobPayload {
  if (!payload || typeof payload !== "object")
    throw new Error("Knowledge backfill payload is required");
  const input = payload as Partial<KnowledgeBackfillJobPayload>;
  if (
    typeof input.jobKey !== "string" ||
    !["content_versions", "chunks", "legacy_artifacts", "degraded_summaries"].includes(
      String(input.kind)
    )
  ) {
    throw new Error("Knowledge backfill payload has an invalid job key or kind");
  }
  return {
    jobKey: input.jobKey,
    kind: input.kind as KnowledgeBackfillKind,
    batchSize: boundedBatchSize(input.batchSize),
    extractorVersion:
      typeof input.extractorVersion === "string" ? input.extractorVersion : undefined,
  };
}

async function enqueuePayload(
  jobs: JobQueueRepository,
  payload: KnowledgeBackfillJobPayload,
  cursor: string | undefined,
  attempt: number
): Promise<void> {
  await jobs.enqueue({
    id: queueJobId(payload.jobKey, cursor, attempt),
    jobType: KNOWLEDGE_BACKFILL_QUEUE_JOB,
    payload: JSON.stringify(payload),
    priority: 2,
    maxRetries: 5,
  });
}

/** Creates one durable checkpoint and queues the first bounded attempt. */
export async function enqueueKnowledgeBackfill(input: {
  repositories: KnowledgeBackfillRepositories;
  kind: KnowledgeBackfillKind;
  scope?: string;
  batchSize?: number;
  extractorVersion?: string;
  now?: () => Date;
}): Promise<KnowledgeBackfillCheckpoint> {
  const now = (input.now ?? (() => new Date()))().toISOString();
  const batchSize = boundedBatchSize(input.batchSize);
  const initial = createInitialBackfillCheckpoint({
    jobType: backfillTypeFor(input.kind),
    scope: input.scope ?? defaultScopeFor(input.kind),
    now,
  });
  initial.checkpoint = {
    ...initial.checkpoint,
    kind: input.kind,
    batchSize,
    extractorVersion: input.extractorVersion ?? BACKFILL_EXTRACTOR_VERSION,
  };
  const checkpoint = await input.repositories.knowledgeBackfills.create(initial);
  if (checkpoint.status !== "completed") {
    await enqueuePayload(
      input.repositories.jobs,
      {
        jobKey: checkpoint.jobKey,
        kind: input.kind,
        batchSize,
        extractorVersion: input.extractorVersion,
      },
      checkpoint.cursor,
      checkpoint.attempt
    );
  }
  return checkpoint;
}

interface BatchResult {
  cursors: string[];
  hasMore: boolean;
}

async function runContentVersionBatch(
  dependencies: KnowledgeBackfillDependencies,
  checkpoint: KnowledgeBackfillCheckpoint,
  payload: KnowledgeBackfillJobPayload,
  now: string
): Promise<BatchResult> {
  const candidates = await dependencies.contentVersions.listReadyCandidates({
    afterItemId: checkpoint.cursor,
    limit: payload.batchSize + 1,
  });
  const batch = candidates.slice(0, payload.batchSize);
  const cursors: string[] = [];
  for (const candidate of batch) {
    const fullContent = candidate.fullContent?.trim();
    const content = fullContent || candidate.summary.trim();
    const source = fullContent ? "full_content" : "summary";
    const identity = createContentVersionIdentity({
      itemId: candidate.itemId,
      content,
      extractorVersion: payload.extractorVersion ?? BACKFILL_EXTRACTOR_VERSION,
    });
    await dependencies.contentVersions.create({
      ...identity,
      itemId: candidate.itemId,
      extractorVersion: payload.extractorVersion ?? BACKFILL_EXTRACTOR_VERSION,
      source,
      content,
      characterCount: content.length,
      tokenCount: estimateTokenCount(content),
      createdAt: now,
    });
    cursors.push(candidate.itemId);
  }
  return { cursors, hasMore: candidates.length > payload.batchSize };
}

async function runChunkBatch(
  dependencies: KnowledgeBackfillDependencies,
  checkpoint: KnowledgeBackfillCheckpoint,
  payload: KnowledgeBackfillJobPayload,
  now: string
): Promise<BatchResult> {
  const candidates = await dependencies.contentChunks.listUnchunkedVersions({
    afterContentVersionId: checkpoint.cursor,
    limit: payload.batchSize + 1,
  });
  const batch = candidates.slice(0, payload.batchSize);
  const cursors: string[] = [];
  for (const version of batch) {
    const records: ContentChunkRecord[] = chunkContent(version.id, version.content).map(
      (chunk) => ({
        ...chunk,
        itemId: version.itemId,
        embeddingStatus: "unconfigured",
        createdAt: now,
      })
    );
    await dependencies.contentChunks.insertMany(records);
    cursors.push(version.id);
  }
  return { cursors, hasMore: candidates.length > payload.batchSize };
}

const artifactId = (parts: unknown[]): string =>
  `art_${sha256(JSON.stringify(parts)).slice("sha256:".length, 39)}`;

async function runLegacyArtifactBatch(
  dependencies: KnowledgeBackfillDependencies,
  checkpoint: KnowledgeBackfillCheckpoint,
  payload: KnowledgeBackfillJobPayload
): Promise<BatchResult> {
  const candidates = await dependencies.intelligenceArtifacts.listLegacySummaryCandidates({
    afterSummaryId: checkpoint.cursor,
    limit: payload.batchSize + 1,
  });
  const batch = candidates.slice(0, payload.batchSize);
  const cursors: string[] = [];
  for (const candidate of batch) {
    const content = candidate.summary.trim();
    const usable = content.length > 0;
    await dependencies.intelligenceArtifacts.publish({
      id: artifactId(["legacy", candidate.summaryId]),
      itemId: candidate.itemId,
      contentVersionId: candidate.contentVersionId,
      artifactType: candidate.promptType === "detailed" ? "detailed_summary" : "brief_summary",
      status: usable ? "ready" : "failed",
      content: usable ? content : undefined,
      contentHash: usable ? sha256(content) : undefined,
      provenance: "legacy_unverified",
      promptVersion: "legacy-unversioned",
      provider: "legacy",
      model: candidate.model,
      makeCurrent: false,
      makeCurrentIfNone: usable,
      metadata: { legacySummaryId: candidate.summaryId, verified: false },
      errorCode: usable ? undefined : "invalid_output",
      errorMessage: usable ? undefined : "Legacy summary was empty",
      createdAt: candidate.createdAt,
      updatedAt: candidate.createdAt,
      completedAt: candidate.createdAt,
    });
    cursors.push(candidate.summaryId);
  }
  return { cursors, hasMore: candidates.length > payload.batchSize };
}

async function runDegradedSummaryBatch(
  dependencies: KnowledgeBackfillDependencies,
  checkpoint: KnowledgeBackfillCheckpoint,
  payload: KnowledgeBackfillJobPayload,
  now: string
): Promise<BatchResult> {
  const candidates = await dependencies.intelligenceArtifacts.listDegradedSummaryCandidates({
    afterItemId: checkpoint.cursor,
    limit: payload.batchSize + 1,
  });
  const batch = candidates.slice(0, payload.batchSize);
  const cursors: string[] = [];
  for (const candidate of batch) {
    const summary = createDegradedSummary({ title: candidate.title, content: candidate.content });
    if (!summary.content)
      throw new Error(`Cannot create a degraded summary for ${candidate.itemId}`);
    await dependencies.intelligenceArtifacts.publish({
      id: artifactId(["degraded", candidate.contentVersionId, summary.contentHash]),
      itemId: candidate.itemId,
      contentVersionId: candidate.contentVersionId,
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
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    });
    cursors.push(candidate.itemId);
  }
  return { cursors, hasMore: candidates.length > payload.batchSize };
}

/** Runs exactly one bounded batch; continuations are persisted before the checkpoint advances. */
export async function runKnowledgeBackfillBatch(
  untrustedPayload: unknown,
  dependencies: KnowledgeBackfillDependencies
): Promise<KnowledgeBackfillCheckpoint> {
  const payload = parsePayload(untrustedPayload);
  const now = (dependencies.now ?? (() => new Date()))().toISOString();
  const checkpoint = await dependencies.knowledgeBackfills.find(payload.jobKey);
  if (!checkpoint)
    throw new Error(`Knowledge backfill checkpoint ${payload.jobKey} does not exist`);
  if (checkpoint.jobType !== backfillTypeFor(payload.kind)) {
    throw new Error(`Knowledge backfill ${payload.jobKey} has the wrong type`);
  }
  if (checkpoint.status === "completed") return checkpoint;
  const running = await dependencies.knowledgeBackfills.start(payload.jobKey, now);
  if (!running || running.status === "completed") return running ?? checkpoint;

  let result: BatchResult;
  try {
    if (payload.kind === "content_versions") {
      result = await runContentVersionBatch(dependencies, running, payload, now);
    } else if (payload.kind === "chunks") {
      result = await runChunkBatch(dependencies, running, payload, now);
    } else if (payload.kind === "legacy_artifacts") {
      result = await runLegacyArtifactBatch(dependencies, running, payload);
    } else {
      result = await runDegradedSummaryBatch(dependencies, running, payload, now);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await dependencies.knowledgeBackfills.fail(payload.jobKey, message, now);
    throw error;
  }

  const cursor = result.cursors.at(-1) ?? running.cursor;
  if (result.hasMore) {
    await enqueuePayload(dependencies.jobs, payload, cursor, running.attempt);
  }
  const advanced = await dependencies.knowledgeBackfills.advance(payload.jobKey, {
    expectedCursor: running.cursor,
    cursor,
    checkpoint: {
      ...running.checkpoint,
      kind: payload.kind,
      batchSize: payload.batchSize,
      lastBatchSize: result.cursors.length,
      lastProcessedAt: now,
    },
    processedDelta: result.cursors.length,
    completed: !result.hasMore,
    at: now,
  });
  return advanced ?? (await dependencies.knowledgeBackfills.find(payload.jobKey)) ?? running;
}

/** Adapter suitable for registration with the existing durable job worker. */
export function createKnowledgeBackfillJobHandler(dependencies: KnowledgeBackfillDependencies) {
  return async (payload: Record<string, unknown>): Promise<void> => {
    await runKnowledgeBackfillBatch(payload, dependencies);
  };
}
