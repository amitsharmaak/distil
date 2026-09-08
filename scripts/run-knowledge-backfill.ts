import { randomUUID } from "node:crypto";

import { createAuthContext, userIdSchema } from "../src/lib/contracts/tenant-context";
import { getTenantRepositories } from "../src/lib/database";
import {
  BACKFILL_EXTRACTOR_VERSION,
  enqueueKnowledgeBackfill,
  runKnowledgeBackfillBatch,
  type KnowledgeBackfillDependencies,
  type KnowledgeBackfillKind,
} from "../src/lib/knowledge/jobs";
import type { JobQueueRepository, RepositorySet } from "../src/lib/repositories/ports";

const kinds: KnowledgeBackfillKind[] = [
  "content_versions",
  "chunks",
  "legacy_artifacts",
  "degraded_summaries",
];

interface Options {
  userId: string;
  selectedKinds: KnowledgeBackfillKind[];
  batchSize: number;
  execute: boolean;
  maxBatches: number;
}

export function parseOptions(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index < 0 ? undefined : argv[index + 1];
  };
  const userId = userIdSchema.parse(value("--user-id"));
  const requestedKind = value("--kind") ?? "all";
  const selectedKinds =
    requestedKind === "all"
      ? kinds
      : kinds.includes(requestedKind as KnowledgeBackfillKind)
        ? [requestedKind as KnowledgeBackfillKind]
        : (() => {
            throw new Error(`Unsupported backfill kind: ${requestedKind}`);
          })();
  const batchSize = Number(value("--batch-size") ?? 25);
  const maxBatches = Number(value("--max-batches") ?? 10_000);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new Error("--batch-size must be an integer from 1 to 100");
  }
  if (!Number.isInteger(maxBatches) || maxBatches < 1) {
    throw new Error("--max-batches must be a positive integer");
  }
  return { userId, selectedKinds, batchSize, execute: argv.includes("--execute"), maxBatches };
}

function directDependencies(repositories: RepositorySet): KnowledgeBackfillDependencies {
  const jobs = {
    enqueue: async () => undefined,
  } as unknown as JobQueueRepository;
  return {
    contentVersions: repositories.contentVersions,
    contentChunks: repositories.contentChunks,
    intelligenceArtifacts: repositories.intelligenceArtifacts,
    knowledgeBackfills: repositories.knowledgeBackfills,
    jobs,
  };
}

async function countCandidates(
  kind: KnowledgeBackfillKind,
  repositories: RepositorySet
): Promise<number> {
  let cursor: string | undefined;
  let count = 0;
  for (let page = 0; page < 10_000; page += 1) {
    if (kind === "content_versions") {
      const rows = await repositories.contentVersions.listReadyCandidates({
        afterItemId: cursor,
        limit: 100,
      });
      count += rows.length;
      cursor = rows.at(-1)?.itemId;
      if (rows.length < 100) return count;
    } else if (kind === "chunks") {
      const rows = await repositories.contentChunks.listUnchunkedVersions({
        afterContentVersionId: cursor,
        limit: 100,
      });
      count += rows.length;
      cursor = rows.at(-1)?.id;
      if (rows.length < 100) return count;
    } else if (kind === "legacy_artifacts") {
      const rows = await repositories.intelligenceArtifacts.listLegacySummaryCandidates({
        afterSummaryId: cursor,
        limit: 100,
      });
      count += rows.length;
      cursor = rows.at(-1)?.summaryId;
      if (rows.length < 100) return count;
    } else {
      const rows = await repositories.intelligenceArtifacts.listDegradedSummaryCandidates({
        afterItemId: cursor,
        limit: 100,
      });
      count += rows.length;
      cursor = rows.at(-1)?.itemId;
      if (rows.length < 100) return count;
    }
  }
  throw new Error(`Candidate scan exceeded its page bound for ${kind}`);
}

async function executeKind(
  kind: KnowledgeBackfillKind,
  options: Options,
  context: ReturnType<typeof createAuthContext>,
  repositories: RepositorySet
) {
  const dependencies = directDependencies(repositories);
  let checkpoint = await enqueueKnowledgeBackfill({
    context,
    repositories: dependencies,
    kind,
    batchSize: options.batchSize,
    extractorVersion: BACKFILL_EXTRACTOR_VERSION,
  });
  let batches = 0;
  while (checkpoint.status !== "completed") {
    if (batches >= options.maxBatches) {
      throw new Error(`Backfill exceeded --max-batches for ${kind}`);
    }
    checkpoint = await runKnowledgeBackfillBatch(
      context,
      {
        userId: context.userId,
        traceId: context.requestId,
        jobKey: checkpoint.jobKey,
        kind,
        batchSize: options.batchSize,
        extractorVersion: BACKFILL_EXTRACTOR_VERSION,
        expectedCursor: checkpoint.cursor ?? null,
      },
      dependencies
    );
    batches += 1;
  }
  return { kind, status: checkpoint.status, processedCount: checkpoint.processedCount, batches };
}

export async function main(argv = process.argv.slice(2)) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const options = parseOptions(argv);
  const context = createAuthContext({
    userId: options.userId,
    actorKind: "system",
    actorId: "00000000-0000-4000-8000-000000000004",
    requestId: randomUUID(),
  });
  const repositories = await getTenantRepositories(context);
  const candidateCounts = Object.fromEntries(
    await Promise.all(
      options.selectedKinds.map(async (kind) => [kind, await countCandidates(kind, repositories)])
    )
  );
  const runs = options.execute
    ? []
    : options.selectedKinds.map((kind) => ({ kind, status: "dry-run", processedCount: 0, batches: 0 }));
  if (options.execute) {
    for (const kind of options.selectedKinds) {
      runs.push(await executeKind(kind, options, context, repositories));
    }
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: options.execute ? "execute" : "dry-run",
        tenant: "configured",
        batchSize: options.batchSize,
        candidateCounts,
        runs,
      },
      null,
      2
    )}\n`
  );
}

if (process.argv[1]?.endsWith("run-knowledge-backfill.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
