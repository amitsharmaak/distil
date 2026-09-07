export { buildDryRunPlan, parseTenantMigrationArgs } from "./cli";
export { tenantBearingTableNames, tenantMigrationManifest } from "./manifest";
export { applyTenantMigrationStage, TENANT_MIGRATION_STAGES } from "./migrator";
export type {
  AppliedTenantMigration,
  ApplyTenantMigrationOptions,
  TenantSchemaMigrationStage,
} from "./migrator";
export {
  buildTenantMigrationReport,
  canonicalJson,
  normalizeExplicitAmitUserId,
  sha256,
  validateManifest,
  verifyAfterAgainstBaseline,
  verifyDiscoveredSchema,
} from "./verifier";
export type { BuildReportInput } from "./verifier";
export type {
  JsonColumnClassification,
  JsonReferenceClassification,
  QueueClassification,
  ReadonlyQueryClient,
  ReferenceClassification,
  TenantMigrationManifest,
  TenantMigrationReport,
  TenantMigrationStage,
  SupplementalTableClassification,
  TenantTableClassification,
  TenantTableSnapshot,
  UniquenessClassification,
  VerificationFailure,
} from "./types";
