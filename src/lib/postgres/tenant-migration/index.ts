export { buildDryRunPlan, parseTenantMigrationArgs } from "./cli";
export { tenantBearingTableNames, tenantMigrationManifest } from "./manifest";
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
  TenantTableClassification,
  TenantTableSnapshot,
  UniquenessClassification,
  VerificationFailure,
} from "./types";
