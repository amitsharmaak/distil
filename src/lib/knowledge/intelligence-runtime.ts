import { z } from "zod";

import {
  AIQuotaExceededError,
  assertTenantAIBudget,
  createTenantAIRouter,
  getEffectiveModel,
} from "@/lib/ai/router";
import { aiLogger } from "@/lib/logger";
import { createClaimEvidence } from "@/lib/knowledge/grounding";
import { createDegradedSummary } from "@/lib/knowledge/artifacts";
import { sha256 } from "@/lib/knowledge/content-identity";
import type { RepositorySet } from "@/lib/repositories/ports";
import { parseAuthContext, userIdSchema, type AuthContext } from "@/lib/contracts/tenant-context";
import type { ContentChunkRecord } from "./types";

export const GROUNDED_SUMMARY_PROMPT_VERSION = "grounded-summary-v1";
export const GROUNDED_SUMMARY_SCHEMA_VERSION = "grounded-summary-schema-v1";
export const SUMMARY_GENERATION_RETRIES = 2;

const payloadSchema = z
  .object({
    userId: userIdSchema,
    itemId: z.string().min(1).max(200),
    contentVersionId: z.string().min(1).max(200),
    artifactId: z.string().min(1).max(200),
    artifactType: z.enum(["brief_summary", "detailed_summary"]),
    jobId: z.string().min(1).max(200).optional(),
    traceId: z.string().min(1).max(200).optional(),
  })
  .strict();

const generatedSummarySchema = z
  .object({
    summary: z.string().trim().min(1).max(40_000),
    claims: z
      .array(
        z
          .object({
            claim: z.string().trim().min(1).max(8_000),
            confidence: z.number().min(0).max(1).optional(),
            evidence: z
              .array(
                z
                  .object({
                    chunkId: z.string().min(1).max(200),
                    startOffset: z.number().int().nonnegative(),
                    endOffset: z.number().int().positive(),
                    exactExcerpt: z.string().min(1).max(8_000),
                  })
                  .strict()
              )
              .min(1)
              .max(8),
          })
          .strict()
      )
      .min(1)
      .max(30),
  })
  .strict();

export interface StructuredSummaryGenerator {
  generate(prompt: string): Promise<{ output: unknown; provider: string; model: string }>;
}

export interface IntelligenceRuntimeOptions {
  generator?: StructuredSummaryGenerator;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => Date;
}

type GeneratedSummary = z.infer<typeof generatedSummarySchema>;

class RuntimeFailure extends Error {
  constructor(
    readonly code:
      | "generation_unavailable"
      | "invalid_output"
      | "insufficient_content"
      | "provider_error"
      | "budget_exceeded",
    message: string,
    readonly attempts = 0
  ) {
    super(message);
    this.name = "RuntimeFailure";
  }
}

export function createRouterStructuredSummaryGenerator(
  context: AuthContext,
  repositories: RepositorySet
): StructuredSummaryGenerator {
  const router = createTenantAIRouter(context, repositories);
  return {
    async generate(prompt) {
      const assignment = getEffectiveModel("summarize");
      return {
        output: await router.generateJSON<unknown>(prompt, "summarize", {
          temperature: 0,
          maxTokens: 4_096,
        }),
        provider: assignment.provider,
        model: assignment.model,
      };
    },
  };
}

function buildPrompt(
  title: string,
  artifactType: "brief_summary" | "detailed_summary",
  chunks: ContentChunkRecord[]
): string {
  const sources = chunks.map((chunk) => `CHUNK ${chunk.id}\n${chunk.content}`).join("\n\n---\n\n");
  return `Create a ${artifactType === "brief_summary" ? "brief" : "detailed"} grounded summary of the saved item titled ${JSON.stringify(title)}.

Return one JSON object with exactly these fields:
{"summary":"string","claims":[{"claim":"string","confidence":0.0,"evidence":[{"chunkId":"string","startOffset":0,"endOffset":1,"exactExcerpt":"string"}]}]}

Every claim must cite one or more exact spans from the supplied chunks. Offsets are JavaScript UTF-16 offsets relative to that chunk. Do not use outside knowledge and do not cite a chunk that was not supplied.

${sources}`;
}

function validateGrounding(output: unknown, chunks: ContentChunkRecord[]): GeneratedSummary {
  const parsed = generatedSummarySchema.safeParse(output);
  if (!parsed.success)
    throw new RuntimeFailure("invalid_output", "Generated summary schema was invalid");
  const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  for (const claim of parsed.data.claims) {
    for (const citation of claim.evidence) {
      const chunk = chunksById.get(citation.chunkId);
      if (!chunk)
        throw new RuntimeFailure(
          "invalid_output",
          "Generated citation referenced an unknown chunk"
        );
      const evidence = createClaimEvidence({
        claimId: "validation",
        chunkId: chunk.id,
        chunkContent: chunk.content,
        startOffset: citation.startOffset,
        endOffset: citation.endOffset,
      });
      if (evidence.exactExcerpt !== citation.exactExcerpt) {
        throw new RuntimeFailure(
          "invalid_output",
          "Generated citation excerpt did not match source"
        );
      }
    }
  }
  return parsed.data;
}

function isTransient(error: unknown): boolean {
  if (error instanceof RuntimeFailure && error.code === "invalid_output") return true;
  const status = Number((error as { status?: unknown })?.status);
  if ([408, 409, 425, 429].includes(status) || status >= 500) return true;
  return /timeout|temporar|rate.?limit|network|connection|unavailable|overloaded/i.test(
    error instanceof Error ? error.message : String(error)
  );
}

async function generateValidated(input: {
  generator: StructuredSummaryGenerator;
  prompt: string;
  chunks: ContentChunkRecord[];
  repositories: RepositorySet;
  sleep: (milliseconds: number) => Promise<void>;
  random: () => number;
}) {
  let lastError: unknown;
  let attempts = 0;
  for (let attempt = 1; attempt <= SUMMARY_GENERATION_RETRIES + 1; attempt += 1) {
    try {
      await assertTenantAIBudget(input.repositories);
      attempts = attempt;
      const generated = await input.generator.generate(input.prompt);
      return {
        summary: validateGrounding(generated.output, input.chunks),
        provider: generated.provider,
        model: generated.model,
        attempts: attempt,
      };
    } catch (error) {
      if (error instanceof AIQuotaExceededError) {
        lastError = new RuntimeFailure("budget_exceeded", error.message, attempt - 1);
        break;
      }
      lastError = error;
      if (attempt > SUMMARY_GENERATION_RETRIES || !isTransient(error)) break;
      const delay = 100 * 2 ** (attempt - 1) + Math.floor(input.random() * 100);
      await input.sleep(delay);
    }
  }
  if (lastError instanceof RuntimeFailure) {
    throw new RuntimeFailure(lastError.code, lastError.message, attempts);
  }
  throw new RuntimeFailure(
    isTransient(lastError) ? "generation_unavailable" : "provider_error",
    "Grounded summary generation failed",
    attempts
  );
}

const claimsArtifactId = (summaryArtifactId: string) =>
  `art_${sha256(JSON.stringify([summaryArtifactId, "claims"])).slice("sha256:".length, 39)}`;

function usageDelta(
  before: Awaited<ReturnType<RepositorySet["agent"]["getDailyAuditStats"]>>,
  after: Awaited<ReturnType<RepositorySet["agent"]["getDailyAuditStats"]>>
) {
  return {
    calls: Math.max(0, after.totalCalls - before.totalCalls),
    tokens: Math.max(0, after.totalTokens - before.totalTokens),
    cost: Number(Math.max(0, after.totalCost - before.totalCost).toFixed(8)),
    source: "audit_log_delta",
  };
}

/** Executes one idempotent, durable summary job; provider failure never replaces a valid current. */
export async function runIntelligenceSummaryJob(
  context: AuthContext,
  untrustedPayload: unknown,
  repositories: RepositorySet,
  options: IntelligenceRuntimeOptions = {}
) {
  const tenant = parseAuthContext(context);
  const payload = payloadSchema.parse(untrustedPayload);
  if (payload.userId !== tenant.userId) throw new Error("Summary job tenant mismatch");
  const now = options.now ?? (() => new Date());
  const artifact = await repositories.intelligenceArtifacts.findById(payload.artifactId);
  if (!artifact) throw new Error(`Summary artifact ${payload.artifactId} does not exist`);
  if (artifact.status !== "pending") return artifact;
  if (
    artifact.itemId !== payload.itemId ||
    artifact.contentVersionId !== payload.contentVersionId ||
    artifact.artifactType !== payload.artifactType
  ) {
    throw new Error("Summary job payload does not match its durable artifact");
  }
  const item = await repositories.items.findById(payload.itemId);
  const version = await repositories.contentVersions.findById(payload.contentVersionId);
  if (!item || !version || version.itemId !== payload.itemId) {
    throw new Error("Summary job source content no longer exists");
  }
  const chunks = await repositories.contentChunks.listForContentVersion(version.id);
  const prior = await repositories.intelligenceArtifacts.findCurrent(
    payload.itemId,
    payload.artifactType
  );
  const claimArtifactId = claimsArtifactId(payload.artifactId);
  const priorClaims = await repositories.intelligenceArtifacts.findById(claimArtifactId);
  if (artifact.content && priorClaims?.status === "pending") {
    const stagedClaims = await repositories.claims.listForArtifact(priorClaims.id);
    if (stagedClaims.length > 0) {
      await repositories.intelligenceArtifacts.complete(priorClaims.id, {
        status: "ready",
        promptVersion: priorClaims.promptVersion,
        provider: priorClaims.provider,
        model: priorClaims.model,
        metadata: { ...priorClaims.metadata, runtimeState: "completed_after_resume" },
        updatedAt: now().toISOString(),
        completedAt: now().toISOString(),
        makeCurrent: true,
      });
    }
  }
  const resumableClaims = await repositories.intelligenceArtifacts.findById(claimArtifactId);
  if (artifact.content && resumableClaims?.status === "ready") {
    return repositories.intelligenceArtifacts.complete(payload.artifactId, {
      status: "ready",
      content: artifact.content,
      contentHash: artifact.contentHash,
      promptVersion: artifact.promptVersion,
      provider: artifact.provider,
      model: artifact.model,
      metadata: { ...artifact.metadata, runtimeState: "completed_after_resume" },
      updatedAt: now().toISOString(),
      completedAt: now().toISOString(),
      makeCurrent: true,
    });
  }

  const started = Date.now();
  const beforeUsage = await repositories.agent.getDailyAuditStats();
  const prompt = buildPrompt(item.title, payload.artifactType, chunks);
  const promptHash = sha256(prompt);
  let generated: Awaited<ReturnType<typeof generateValidated>>;
  try {
    if (chunks.length === 0) {
      throw new RuntimeFailure("insufficient_content", "No source chunks are available");
    }
    generated = await generateValidated({
      generator: options.generator ?? createRouterStructuredSummaryGenerator(tenant, repositories),
      prompt,
      chunks,
      repositories,
      sleep:
        options.sleep ??
        ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))),
      random: options.random ?? Math.random,
    });
  } catch (error) {
    if (!(error instanceof RuntimeFailure)) throw error;
    const failure = error;
    const completedAt = now().toISOString();
    const afterUsage = await repositories.agent.getDailyAuditStats();
    const metadata = {
      ...artifact.metadata,
      jobId: payload.jobId ?? artifact.metadata.jobId,
      traceId: payload.traceId ?? artifact.metadata.traceId,
      promptVersion: GROUNDED_SUMMARY_PROMPT_VERSION,
      schemaVersion: GROUNDED_SUMMARY_SCHEMA_VERSION,
      promptHash,
      attempt: failure.attempts,
      latencyMs: Math.max(0, Date.now() - started),
      usage: usageDelta(beforeUsage, afterUsage),
      runtimeState: prior ? "failed_preserved_previous" : "degraded_fallback",
    };
    if (prior) {
      const failed = await repositories.intelligenceArtifacts.complete(payload.artifactId, {
        status: "failed",
        metadata,
        errorCode: failure.code,
        errorMessage: failure.message,
        updatedAt: completedAt,
        completedAt,
        makeCurrent: false,
      });
      aiLogger.warn(
        { itemId: payload.itemId, artifactId: payload.artifactId, errorCode: failure.code },
        "Grounded summary failed; previous artifact retained"
      );
      return failed;
    }
    const fallback = createDegradedSummary({ title: item.title, content: version.content });
    return repositories.intelligenceArtifacts.complete(payload.artifactId, {
      status: "degraded",
      content: fallback.content,
      contentHash: fallback.contentHash,
      promptVersion: "extractive-v1",
      metadata: { ...metadata, sentenceCount: fallback.sentenceCount },
      errorCode: failure.code,
      errorMessage: failure.message,
      updatedAt: completedAt,
      completedAt,
      makeCurrent: true,
    });
  }

  const completedAt = now().toISOString();
  const afterUsage = await repositories.agent.getDailyAuditStats();
  const metadata = {
    ...artifact.metadata,
    jobId: payload.jobId ?? artifact.metadata.jobId,
    traceId: payload.traceId ?? artifact.metadata.traceId,
    promptVersion: GROUNDED_SUMMARY_PROMPT_VERSION,
    schemaVersion: GROUNDED_SUMMARY_SCHEMA_VERSION,
    provider: generated.provider,
    model: generated.model,
    promptHash,
    outputHash: sha256(JSON.stringify(generated.summary)),
    attempt: generated.attempts,
    latencyMs: Math.max(0, Date.now() - started),
    usage: usageDelta(beforeUsage, afterUsage),
    runtimeState: "validated",
  };
  await repositories.intelligenceArtifacts.updatePending(payload.artifactId, {
    content: generated.summary.summary,
    contentHash: sha256(generated.summary.summary),
    promptVersion: GROUNDED_SUMMARY_PROMPT_VERSION,
    provider: generated.provider,
    model: generated.model,
    metadata,
    updatedAt: completedAt,
  });

  const claimsArtifact = (
    await repositories.intelligenceArtifacts.publish({
      id: claimArtifactId,
      itemId: payload.itemId,
      contentVersionId: payload.contentVersionId,
      artifactType: "claims",
      status: "pending",
      provenance: "generated",
      promptVersion: GROUNDED_SUMMARY_PROMPT_VERSION,
      provider: generated.provider,
      model: generated.model,
      makeCurrent: false,
      metadata: { ...metadata, summaryArtifactId: payload.artifactId },
      createdAt: completedAt,
      updatedAt: completedAt,
    })
  ).record;
  await repositories.claims.insertWithEvidence(
    generated.summary.claims.map((claim, ordinal) => {
      const claimHash = sha256(claim.claim);
      const claimId = `clm_${sha256(JSON.stringify([claimsArtifact.id, ordinal, claimHash])).slice(
        "sha256:".length,
        39
      )}`;
      return {
        id: claimId,
        artifactId: claimsArtifact.id,
        ordinal,
        claim: claim.claim,
        claimHash,
        confidence: claim.confidence,
        evidence: claim.evidence.map((citation) => {
          const chunk = chunks.find((candidate) => candidate.id === citation.chunkId)!;
          return createClaimEvidence({
            claimId,
            chunkId: citation.chunkId,
            chunkContent: chunk.content,
            startOffset: citation.startOffset,
            endOffset: citation.endOffset,
          });
        }),
      };
    })
  );
  await repositories.intelligenceArtifacts.complete(claimsArtifact.id, {
    status: "ready",
    promptVersion: GROUNDED_SUMMARY_PROMPT_VERSION,
    provider: generated.provider,
    model: generated.model,
    metadata,
    updatedAt: completedAt,
    completedAt,
    makeCurrent: true,
  });
  const completed = await repositories.intelligenceArtifacts.complete(payload.artifactId, {
    status: "ready",
    content: generated.summary.summary,
    contentHash: sha256(generated.summary.summary),
    promptVersion: GROUNDED_SUMMARY_PROMPT_VERSION,
    provider: generated.provider,
    model: generated.model,
    metadata: { ...metadata, runtimeState: "completed", claimsArtifactId: claimsArtifact.id },
    updatedAt: completedAt,
    completedAt,
    makeCurrent: true,
  });
  aiLogger.info(
    { itemId: payload.itemId, artifactId: payload.artifactId, promptHash },
    "Grounded intelligence summary completed"
  );
  return completed;
}

export function createIntelligenceSummaryJobHandler(
  context: AuthContext,
  repositories: RepositorySet,
  options: IntelligenceRuntimeOptions = {}
) {
  const tenant = parseAuthContext(context);
  return async (payload: Record<string, unknown>): Promise<void> => {
    await runIntelligenceSummaryJob(tenant, payload, repositories, options);
  };
}
