export type DigestStatus = "pending" | "ready" | "degraded" | "failed";
export type DigestCategory = "priority" | "resurfaced";

export interface PersonalPreferences {
  digestEnabled: boolean;
  digestTimezone: string;
  personalizationEnabled: boolean;
  updatedAt: string;
}

export interface DigestItem {
  digestRunId: string;
  itemId: string;
  category: DigestCategory;
  position: number;
  reason: string;
  title: string;
  summary: string;
  selectionMetadata: Record<string, unknown>;
  dismissedAt?: string;
}

export interface DigestRun {
  id: string;
  localDate: string;
  timezone: string;
  status: DigestStatus;
  contentMode: "deterministic" | "ai";
  selectionVersion: string;
  selectionMetadata: Record<string, unknown>;
  title: string;
  summary: string;
  createdAt: string;
  completedAt?: string;
  dismissedAt?: string;
  items: DigestItem[];
}

export interface DigestCandidate {
  id: string;
  title: string;
  summary: string;
  priority: "high" | "medium" | "low";
  manualPriority?: "high" | "medium" | "low";
  createdAt: string;
}

export interface DigestJob {
  id: string;
  localDate: string;
  idempotencyKey: string;
  status: "queued" | "running" | "completed" | "failed";
  requestedBy: "cron" | "manual";
  createdAt: string;
}

export interface DigestStore {
  getPreferences(): Promise<PersonalPreferences>;
  updatePreferences(
    patch: Partial<
      Pick<PersonalPreferences, "digestEnabled" | "digestTimezone" | "personalizationEnabled">
    >
  ): Promise<PersonalPreferences>;
  resetPreferences(): Promise<PersonalPreferences>;
  findDigest(localDate: string): Promise<DigestRun | undefined>;
  listDigests(limit: number): Promise<DigestRun[]>;
  createDigest(run: DigestRun): Promise<DigestRun>;
  dismissDigest(id: string, at: string): Promise<DigestRun | undefined>;
  dismissDigestItem(
    digestRunId: string,
    itemId: string,
    at: string
  ): Promise<DigestItem | undefined>;
  listPriorityCandidates(): Promise<DigestCandidate[]>;
  listResurfacedCandidates(): Promise<DigestCandidate[]>;
  enqueue(job: DigestJob): Promise<DigestJob>;
}
