import { tenantMigrationManifest, tenantBearingTableNames } from "./manifest";
import { normalizeExplicitAmitUserId, sha256, validateManifest } from "./verifier";
import type { TenantMigrationStage } from "./types";

export interface TenantMigrationCliOptions {
  readonly ownerId: string;
  readonly dryRun: boolean;
  readonly stage?: TenantMigrationStage;
  readonly output?: string;
  readonly baseline?: string;
}

export const TENANT_MIGRATION_USAGE = `Usage:
  npm run db:tenant:verify -- --amit-user-id <uuid> --dry-run
  npm run db:tenant:verify -- --amit-user-id <uuid> --stage rehearsal --output <report.json>
  npm run db:tenant:verify -- --amit-user-id <uuid> --stage before --output <report.json>
  npm run db:tenant:verify -- --amit-user-id <uuid> --stage after --baseline <before.json> --output <report.json>

The Amit UUID must be supplied directly. Email addresses and environment-derived ownership are not accepted.`;

export function parseTenantMigrationArgs(argv: readonly string[]): TenantMigrationCliOptions {
  let ownerId: string | undefined;
  let stage: TenantMigrationStage | undefined;
  let output: string | undefined;
  let baseline: string | undefined;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      return value;
    };
    if (argument === "--amit-user-id") ownerId = next();
    else if (argument === "--stage") {
      const value = next();
      if (value !== "before" && value !== "after" && value !== "rehearsal") {
        throw new Error(`Invalid --stage: ${value}`);
      }
      stage = value;
    } else if (argument === "--output") output = next();
    else if (argument === "--baseline") baseline = next();
    else if (argument === "--dry-run") dryRun = true;
    else if (argument === "--help" || argument === "-h") throw new Error(TENANT_MIGRATION_USAGE);
    else throw new Error(`Unknown argument: ${argument}`);
  }

  if (!ownerId) throw new Error("--amit-user-id is required; ownership is never inferred");
  ownerId = normalizeExplicitAmitUserId(ownerId);
  if (dryRun) {
    if (stage || output || baseline) {
      throw new Error("--dry-run cannot be combined with --stage, --output, or --baseline");
    }
    return { ownerId, dryRun };
  }
  if (!stage) throw new Error("--stage is required unless --dry-run is used");
  if (!output) throw new Error("--output is required for database-backed verification");
  if (stage === "after" && !baseline) throw new Error("--baseline is required for the after stage");
  if (stage !== "after" && baseline)
    throw new Error("--baseline is only valid for the after stage");
  return { ownerId, dryRun, stage, output, ...(baseline ? { baseline } : {}) };
}

export function buildDryRunPlan(ownerId: string) {
  validateManifest(tenantMigrationManifest);
  return {
    contractVersion: tenantMigrationManifest.contractVersion,
    manifestId: tenantMigrationManifest.id,
    manifestHash: sha256(tenantMigrationManifest),
    mode: "dry-run" as const,
    readOnly: true as const,
    connectsToDatabase: false as const,
    immutableOwner: {
      label: "Amit" as const,
      userId: normalizeExplicitAmitUserId(ownerId),
      source: "explicit-cli-argument" as const,
    },
    tenantTables: tenantBearingTableNames,
    lifecycle: [
      {
        stage: "expand",
        implementedHere: true,
        prerequisite: "Apply only through db:tenant:migrate with the reviewed immutable UUID.",
      },
      {
        stage: "backfill",
        implementedHere: true,
        prerequisite:
          "Freeze writes and preserve the before report; only null owners receive the UUID.",
      },
      {
        stage: "verify",
        implementedHere: true,
        prerequisite: "Frozen before/after reports use this unchanged manifest.",
      },
      {
        stage: "contract",
        implementedHere: true,
        prerequisite:
          "Pass the before report; verification reruns transactionally before constraints and RLS.",
      },
      {
        stage: "lifecycle",
        implementedHere: true,
        prerequisite:
          "Apply only after contract; adds account lifecycle state without changing frozen data.",
      },
    ],
    controls: [
      "discover-and-reject-unclassified-application-tables",
      "classify-every-jsonb-column",
      "record-counts-and-owner-nullability",
      "record-stable-and-high-value-checksums",
      "record-relational-and-json-reference-orphans",
      "record-projected-uniqueness-collisions",
      "record-queue-state",
      "compare-before-and-after-invariant-fingerprints",
    ],
    mutationPolicy:
      "This dry run is read-only; mutations require a separate explicit one-stage db:tenant:migrate invocation.",
  };
}
