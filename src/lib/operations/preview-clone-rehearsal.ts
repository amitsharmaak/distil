import { z } from "zod";

const uuid = z.string().uuid();
const opaqueId = z.string().trim().min(1).max(200);
const sha = z.string().regex(/^[0-9a-f]{7,64}$/u, "release SHA must be lowercase hexadecimal");

export const previewCloneRehearsalInputSchema = z
  .object({
    runId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u),
    releaseSha: sha,
    primaryUserId: uuid,
    syntheticUserId: uuid,
    vercelProjectId: opaqueId,
    neonProjectId: opaqueId,
    sourceBranchId: opaqueId,
    rehearsalBranchId: opaqueId,
    restoreBranchId: opaqueId,
    rollbackOwner: z.string().trim().min(1).max(120),
    pitrWindow: z.string().trim().min(1).max(120),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.primaryUserId === value.syntheticUserId) {
      context.addIssue({ code: "custom", message: "synthetic user must differ from primary user" });
    }
    const branchIds = [value.sourceBranchId, value.rehearsalBranchId, value.restoreBranchId];
    if (new Set(branchIds).size !== branchIds.length) {
      context.addIssue({
        code: "custom",
        message: "source, rehearsal, and restore branches differ",
      });
    }
  });

export type PreviewCloneRehearsalInput = z.infer<typeof previewCloneRehearsalInputSchema>;

export interface RehearsalStep {
  readonly id: string;
  readonly mutatesExternalState: boolean;
  readonly requiresOperatorCheckpoint: boolean;
  readonly evidence: readonly string[];
}

export function buildPreviewCloneRehearsalPlan(raw: PreviewCloneRehearsalInput) {
  const input = previewCloneRehearsalInputSchema.parse(raw);
  const artifactRoot = `artifacts/preview-clone-rehearsal/${input.runId}`;
  const steps: RehearsalStep[] = [
    {
      id: "record-provider-metadata-and-freeze",
      mutatesExternalState: false,
      requiresOperatorCheckpoint: true,
      evidence: ["provider-metadata.json", "feature-flags.json", "queue-freeze.json"],
    },
    {
      id: "capture-source-recovery-point-and-object-inventory",
      mutatesExternalState: false,
      requiresOperatorCheckpoint: true,
      evidence: ["source-recovery-point.json", "source-object-inventory.json"],
    },
    {
      id: "migrate-isolated-rehearsal-clone",
      mutatesExternalState: true,
      requiresOperatorCheckpoint: true,
      evidence: ["tenant-before.json", "tenant-after.json", "migration-ledger.json"],
    },
    {
      id: "exercise-two-user-export-and-recovery",
      mutatesExternalState: true,
      requiresOperatorCheckpoint: true,
      evidence: ["two-user-isolation.json", "export-recovery.json", "export-objects.json"],
    },
    {
      id: "exercise-deletion-failure-recovery",
      mutatesExternalState: true,
      requiresOperatorCheckpoint: true,
      evidence: ["deletion-recovery.json", "purge-verification.json", "post-purge-objects.json"],
    },
    {
      id: "restore-into-second-isolated-branch",
      mutatesExternalState: true,
      requiresOperatorCheckpoint: true,
      evidence: ["restored-tenant-after.json", "restore-comparison.json", "tombstone-replay.json"],
    },
    {
      id: "rollback-application-and-database-routing",
      mutatesExternalState: true,
      requiresOperatorCheckpoint: true,
      evidence: ["rollback.json", "post-rollback-smoke.json"],
    },
  ];
  return {
    contractVersion: 1,
    mode: "dry-run" as const,
    connectsToProviders: false as const,
    mutatesExternalState: false as const,
    input,
    artifactRoot,
    mandatoryEnvironment: {
      FEATURE_NEON_AUTH: "false",
      FEATURE_CONNECTORS: "false",
      VERCEL_ENV: "preview",
      DISTIL_REHEARSAL_TARGET: "isolated-preview-clone",
    },
    guardrails: [
      "Never use Production database, auth, object-store, email, queue, or deployment resources.",
      "Use direct unpooled URLs only for migration commands and never record URL values.",
      "Keep web traffic, cron, queues, connectors, invitations, email, and AI disabled during restore.",
      "Use only synthetic accounts on the rehearsal and restored branches.",
      "Pause after every mutating step and retain the previous branch and deployment read-only.",
      "Replay deletion tombstones newer than the recovery point before enabling any worker or traffic.",
    ],
    steps,
  };
}

const ledgerEntrySchema = z
  .object({ stage: z.string().min(1), name: z.string().min(1), checksum: z.string().min(1) })
  .strict();

export const previewCloneEvidenceSchema = z
  .object({
    contractVersion: z.literal(1),
    runId: z.string().min(1),
    releaseSha: sha,
    featureFlags: z.object({ neonAuth: z.literal(false), connectors: z.literal(false) }).strict(),
    providerProjects: z.object({ vercel: opaqueId, neon: opaqueId }).strict(),
    branches: z.object({ source: opaqueId, rehearsal: opaqueId, restored: opaqueId }).strict(),
    source: z
      .object({ invariantFingerprint: z.string().min(1), ledger: z.array(ledgerEntrySchema) })
      .strict(),
    restored: z
      .object({ invariantFingerprint: z.string().min(1), ledger: z.array(ledgerEntrySchema) })
      .strict(),
    twoUserIsolation: z
      .object({
        primaryCannotReadSynthetic: z.literal(true),
        syntheticCannotReadPrimary: z.literal(true),
      })
      .strict(),
    exportRecovery: z
      .object({
        retryUsedSameJob: z.literal(true),
        hashAndSizeVerified: z.literal(true),
        crossTenantDenied: z.literal(true),
      })
      .strict(),
    deletionRecovery: z
      .object({
        retryResumedCheckpoint: z.literal(true),
        remainingRows: z.literal(0),
        remainingObjects: z.literal(0),
        authPurged: z.literal(true),
        tombstonePresent: z.literal(true),
      })
      .strict(),
    tombstoneReplay: z
      .object({ newerTombstonesApplied: z.literal(true), resurrectedUsers: z.literal(0) })
      .strict(),
    rollback: z
      .object({ applicationSha: sha, databaseBranchId: opaqueId, smokePassed: z.literal(true) })
      .strict(),
  })
  .strict();

export type PreviewCloneEvidence = z.infer<typeof previewCloneEvidenceSchema>;

function stableLedger(entries: readonly z.infer<typeof ledgerEntrySchema>[]): string {
  return JSON.stringify(
    [...entries]
      .sort((left, right) => left.stage.localeCompare(right.stage))
      .map(({ stage, name, checksum }) => ({ stage, name, checksum }))
  );
}

export function verifyPreviewCloneEvidence(
  raw: unknown,
  expectedInput?: PreviewCloneRehearsalInput
): PreviewCloneEvidence {
  const evidence = previewCloneEvidenceSchema.parse(raw);
  if (expectedInput) {
    const expected = previewCloneRehearsalInputSchema.parse(expectedInput);
    if (evidence.runId !== expected.runId || evidence.releaseSha !== expected.releaseSha) {
      throw new Error("Evidence run ID and release SHA must match the approved rehearsal input");
    }
    if (
      evidence.providerProjects.vercel !== expected.vercelProjectId ||
      evidence.providerProjects.neon !== expected.neonProjectId
    ) {
      throw new Error("Evidence provider project IDs must match the approved rehearsal input");
    }
    if (
      evidence.branches.source !== expected.sourceBranchId ||
      evidence.branches.rehearsal !== expected.rehearsalBranchId ||
      evidence.branches.restored !== expected.restoreBranchId
    ) {
      throw new Error("Evidence branch IDs must match the approved rehearsal input");
    }
  }
  if (new Set(Object.values(evidence.branches)).size !== 3) {
    throw new Error("Evidence must use distinct source, rehearsal, and restored branches");
  }
  if (evidence.source.invariantFingerprint !== evidence.restored.invariantFingerprint) {
    throw new Error("Restored tenant invariant fingerprint differs from the source recovery point");
  }
  if (stableLedger(evidence.source.ledger) !== stableLedger(evidence.restored.ledger)) {
    throw new Error("Restored migration ledger differs from the source recovery point");
  }
  if (evidence.rollback.applicationSha === evidence.releaseSha) {
    throw new Error("Rollback evidence must name the distinct previously accepted application SHA");
  }
  if (evidence.rollback.databaseBranchId !== evidence.branches.source) {
    throw new Error("Rollback must route to the preserved source branch recorded by this run");
  }
  return evidence;
}
