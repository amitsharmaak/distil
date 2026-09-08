export const TENANT_MIGRATION_CONTRACT_VERSION = 1 as const;

export type TenantMigrationStage = "before" | "after" | "rehearsal";

export interface ReferenceClassification {
  readonly name: string;
  readonly columns: readonly string[];
  readonly targetTable: string;
  readonly targetColumns: readonly string[];
}

export interface UniquenessClassification {
  readonly name: string;
  readonly columns: readonly string[];
  readonly predicate?: string;
}

export interface QueueClassification {
  readonly statusColumn: string;
  readonly kindColumn?: string;
}

export interface JsonReferenceClassification {
  readonly name: string;
  readonly column: string;
  readonly path: string;
  readonly targetTable: string;
  readonly targetColumn: string;
}

export interface JsonColumnClassification {
  readonly column: string;
  /** Explains why a JSON column with no declared references is safe to ignore. */
  readonly noTenantReferences?: string;
  readonly references?: readonly JsonReferenceClassification[];
}

export interface TenantTableClassification {
  readonly schema: string;
  readonly table: string;
  readonly tenantBearing: true;
  readonly ownerColumn: "user_id";
  /** Columns introduced and derived by the tenancy migration, excluded from frozen-data hashes. */
  readonly migrationColumns?: readonly string[];
  readonly identityColumns: readonly string[];
  readonly highValueColumns: readonly string[];
  readonly references: readonly ReferenceClassification[];
  readonly uniqueness: readonly UniquenessClassification[];
  readonly jsonColumns: readonly JsonColumnClassification[];
  readonly queue?: QueueClassification;
}

export interface ControlTableClassification {
  readonly schema: string;
  readonly table: string;
  readonly tenantBearing: false;
  readonly reason: string;
  readonly introducedIn?: "expand" | "lifecycle";
}

export interface SupplementalTableClassification {
  readonly schema: string;
  readonly table: string;
  readonly tenantBearing: boolean;
  readonly ownerColumn?: "id" | "user_id";
  readonly lifecycle: "identity" | "account" | "normalized-link";
  readonly jsonColumns: readonly JsonColumnClassification[];
  readonly reason: string;
  readonly introducedIn?: "expand" | "lifecycle";
}

export interface TenantProtectedTableClassification {
  readonly schema: string;
  readonly table: string;
  readonly ownerColumn: "id" | "user_id";
}

export interface TenantMigrationManifest {
  readonly contractVersion: typeof TENANT_MIGRATION_CONTRACT_VERSION;
  readonly id: string;
  readonly applicationSchemas: readonly string[];
  readonly immutableOwner: {
    readonly label: "Amit";
    readonly source: "explicit-cli-argument";
    readonly column: "user_id";
    readonly sqlType: "uuid";
  };
  readonly tables: readonly TenantTableClassification[];
  /** Phase 3 tables created by expand and therefore excluded from frozen Phase 2 row hashes. */
  readonly supplementalTables: readonly SupplementalTableClassification[];
  readonly controlTables: readonly ControlTableClassification[];
}

export interface QueryRow {
  readonly [key: string]: unknown;
}

export interface ReadonlyQueryClient {
  unsafe(query: string): Promise<readonly QueryRow[]>;
}

export interface QueueStateCount {
  readonly status: string;
  readonly kind: string | null;
  readonly count: number;
}

export interface OrphanCount {
  readonly name: string;
  readonly count: number;
}

export interface UniquenessCollisionCount {
  readonly name: string;
  readonly groups: number;
  readonly rows: number;
}

export interface JsonReferenceCount {
  readonly name: string;
  readonly sourceColumn: string;
  readonly path: string;
  readonly target: string;
  readonly references: number;
  readonly orphans: number;
}

export interface TenantTableSnapshot {
  readonly schema: string;
  readonly table: string;
  readonly rowCount: number;
  /** MD5 is used only as a deterministic change detector, never for security. */
  readonly stableChecksum: string;
  readonly highValueChecksums: Readonly<Record<string, string>>;
  readonly ownership: {
    readonly column: "user_id";
    readonly columnPresent: boolean;
    readonly nullOwnerCount: number | null;
    readonly mismatchedOwnerCount: number | null;
    readonly projectedNullOwnerCount: 0;
    readonly projectedMismatchedOwnerCount: 0;
  };
  readonly orphans: readonly OrphanCount[];
  readonly uniquenessCollisions: readonly UniquenessCollisionCount[];
  readonly queueState: readonly QueueStateCount[];
  readonly jsonReferences: readonly JsonReferenceCount[];
}

export interface VerificationFailure {
  readonly code: string;
  readonly table?: string;
  readonly detail: string;
}

export interface TenantMigrationReport {
  readonly contractVersion: typeof TENANT_MIGRATION_CONTRACT_VERSION;
  readonly manifestId: string;
  readonly manifestHash: string;
  readonly stage: TenantMigrationStage;
  readonly generatedAt: string;
  readonly immutableOwner: {
    readonly label: "Amit";
    readonly userId: string;
    readonly source: "explicit-cli-argument";
  };
  readonly schema: {
    readonly applicationSchemas: readonly string[];
    readonly discoveredTables: readonly string[];
    readonly tenantTables: readonly string[];
    readonly controlTables: readonly string[];
  };
  readonly tables: readonly TenantTableSnapshot[];
  readonly verification: {
    readonly passed: boolean;
    readonly failures: readonly VerificationFailure[];
  };
  readonly rehearsal?: {
    readonly readOnly: true;
    readonly projectionPasses: 2;
    readonly assignments: readonly {
      readonly table: string;
      readonly firstPass: number;
      readonly secondPass: 0;
    }[];
    readonly firstFingerprint: string;
    readonly secondFingerprint: string;
    readonly idempotent: boolean;
  };
  /** Excludes generatedAt so two equivalent runs have the same fingerprint. */
  readonly invariantFingerprint: string;
}
