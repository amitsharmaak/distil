import {
  buildPreviewCloneRehearsalPlan,
  verifyPreviewCloneEvidence,
} from "../preview-clone-rehearsal";

const input = {
  runId: "wave3-20260908",
  releaseSha: "a123456",
  primaryUserId: "123e4567-e89b-42d3-a456-426614174000",
  syntheticUserId: "123e4567-e89b-42d3-a456-426614174001",
  vercelProjectId: "project-preview",
  neonProjectId: "neon-preview",
  sourceBranchId: "branch-source",
  rehearsalBranchId: "branch-rehearsal",
  restoreBranchId: "branch-restore",
  rollbackOwner: "operator@example.invalid",
  pitrWindow: "7 days",
};

const ledger = [
  { stage: "expand", name: "0005_phase3_tenant_expand.sql", checksum: "expand-hash" },
  { stage: "backfill", name: "0006_phase3_tenant_backfill.sql", checksum: "backfill-hash" },
];

function evidence() {
  return {
    contractVersion: 1 as const,
    runId: input.runId,
    releaseSha: input.releaseSha,
    featureFlags: { neonAuth: false as const, connectors: false as const },
    providerProjects: { vercel: input.vercelProjectId, neon: input.neonProjectId },
    branches: {
      source: input.sourceBranchId,
      rehearsal: input.rehearsalBranchId,
      restored: input.restoreBranchId,
    },
    source: { invariantFingerprint: "dataset-hash", ledger },
    restored: { invariantFingerprint: "dataset-hash", ledger: [...ledger].reverse() },
    twoUserIsolation: {
      primaryCannotReadSynthetic: true as const,
      syntheticCannotReadPrimary: true as const,
    },
    exportRecovery: {
      retryUsedSameJob: true as const,
      hashAndSizeVerified: true as const,
      crossTenantDenied: true as const,
    },
    deletionRecovery: {
      retryResumedCheckpoint: true as const,
      remainingRows: 0 as const,
      remainingObjects: 0 as const,
      authPurged: true as const,
      tombstonePresent: true as const,
    },
    tombstoneReplay: { newerTombstonesApplied: true as const, resurrectedUsers: 0 as const },
    rollback: {
      applicationSha: "b765432",
      databaseBranchId: input.sourceBranchId,
      smokePassed: true as const,
    },
  };
}

describe("Preview clone rehearsal contract", () => {
  it("builds a connection-free, dry-run-by-default plan", () => {
    const plan = buildPreviewCloneRehearsalPlan(input);
    expect(plan).toMatchObject({
      mode: "dry-run",
      connectsToProviders: false,
      mutatesExternalState: false,
      mandatoryEnvironment: {
        FEATURE_NEON_AUTH: "false",
        FEATURE_CONNECTORS: "false",
        VERCEL_ENV: "preview",
      },
    });
    expect(plan.steps).toHaveLength(7);
    expect(plan.steps.every((step) => step.requiresOperatorCheckpoint)).toBe(true);
    expect(JSON.stringify(plan)).not.toContain("postgres://");
  });

  it("requires distinct users and branches", () => {
    expect(() =>
      buildPreviewCloneRehearsalPlan({ ...input, syntheticUserId: input.primaryUserId })
    ).toThrow("synthetic user must differ");
    expect(() =>
      buildPreviewCloneRehearsalPlan({ ...input, restoreBranchId: input.sourceBranchId })
    ).toThrow("source, rehearsal, and restore branches differ");
  });

  it("accepts complete restore, lifecycle recovery, purge, and rollback evidence", () => {
    expect(verifyPreviewCloneEvidence(evidence(), input)).toMatchObject({
      runId: input.runId,
      deletionRecovery: { remainingRows: 0, remainingObjects: 0, authPurged: true },
    });
  });

  it("fails closed on restore drift or incomplete deletion evidence", () => {
    const drifted = evidence();
    drifted.restored.invariantFingerprint = "different";
    expect(() => verifyPreviewCloneEvidence(drifted)).toThrow("invariant fingerprint differs");

    const incomplete = evidence() as Record<string, unknown>;
    incomplete.deletionRecovery = {
      retryResumedCheckpoint: true,
      remainingRows: 1,
      remainingObjects: 0,
      authPurged: true,
      tombstonePresent: true,
    };
    expect(() => verifyPreviewCloneEvidence(incomplete)).toThrow();
  });

  it("requires rollback to the preserved source branch and a prior application SHA", () => {
    const sameSha = evidence();
    sameSha.rollback.applicationSha = input.releaseSha;
    expect(() => verifyPreviewCloneEvidence(sameSha)).toThrow(
      "previously accepted application SHA"
    );

    const wrongBranch = evidence();
    wrongBranch.rollback.databaseBranchId = "some-other-branch";
    expect(() => verifyPreviewCloneEvidence(wrongBranch)).toThrow("preserved source branch");
  });

  it("binds evidence to the approved project, branch, run, and release metadata", () => {
    const wrongProject = evidence();
    wrongProject.providerProjects.neon = "unapproved-project";
    expect(() => verifyPreviewCloneEvidence(wrongProject, input)).toThrow("project IDs must match");

    const wrongRun = evidence();
    wrongRun.releaseSha = "ccccccc";
    expect(() => verifyPreviewCloneEvidence(wrongRun, input)).toThrow("release SHA must match");
  });
});
