import type { CaptureReceipt, CaptureSource, CaptureStatus } from "@/lib/contracts/capture";
import type { IntelligenceArtifact } from "@/lib/knowledge/artifacts";
import type {
  ClaimEvidence,
  ContentChunkRecord,
  ContentVersionSource,
  GroundedClaim,
  ItemContentVersion,
  KnowledgeBackfillCheckpoint,
  KnowledgeBackfillType,
} from "@/lib/knowledge/types";
import type { ContentItem, Notification, Priority } from "@/lib/types";
import type { UserId } from "@/lib/contracts/tenant-context";
import type { AuthRepositoryPort } from "@/lib/auth/ports";

export interface ItemFilters {
  sourceType?: string;
  contentType?: string;
  priority?: string;
  isRead?: boolean;
  limit?: number;
  offset?: number;
  sort?: "recent" | "priority" | "ai_priority";
  query?: string;
  includeProcessing?: boolean;
}

export interface ItemRepository {
  list(filters?: ItemFilters): Promise<ContentItem[]>;
  findById(id: string): Promise<ContentItem | undefined>;
  findByNormalizedUrl(url: string): Promise<ContentItem | undefined>;
  listRejected(limit?: number, offset?: number): Promise<{ items: ContentItem[]; total: number }>;
  insert(item: ContentItem): Promise<ContentItem>;
  update(id: string, patch: Partial<ContentItem>): Promise<ContentItem | undefined>;
  delete(id: string): Promise<boolean>;
  updateProcessingStatus(
    id: string,
    status: "processing" | "ready" | "rejected",
    rejectionReason?: string
  ): Promise<void>;
  updatePriorityScore(id: string, score: number, priority: Priority): Promise<void>;
}

export interface ItemNoteRecord {
  itemId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ItemNoteRepository {
  find(itemId: string): Promise<ItemNoteRecord | undefined>;
  upsert(record: ItemNoteRecord): Promise<ItemNoteRecord>;
  delete(itemId: string): Promise<boolean>;
}

export type AnnotationStatus = "active" | "orphaned";

export interface AnnotationRecord {
  id: string;
  itemId: string;
  selectedQuote: string;
  prefix: string;
  suffix: string;
  startOffset?: number;
  endOffset?: number;
  contentHash: string;
  contentVersion: string;
  comment?: string;
  status: AnnotationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AnnotationRepository {
  listForItem(itemId: string): Promise<AnnotationRecord[]>;
  create(record: AnnotationRecord): Promise<AnnotationRecord>;
  update(
    id: string,
    patch: Partial<
      Pick<
        AnnotationRecord,
        | "selectedQuote"
        | "prefix"
        | "suffix"
        | "startOffset"
        | "endOffset"
        | "contentHash"
        | "contentVersion"
        | "comment"
        | "status"
        | "updatedAt"
      >
    >
  ): Promise<AnnotationRecord | undefined>;
  delete(id: string): Promise<boolean>;
}

export interface CollectionRecord {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionItemRecord {
  collectionId: string;
  itemId: string;
  position: number;
  addedAt: string;
}

export interface CollectionRepository {
  list(): Promise<CollectionRecord[]>;
  find(id: string): Promise<CollectionRecord | undefined>;
  create(record: CollectionRecord): Promise<CollectionRecord>;
  update(
    id: string,
    patch: Partial<Pick<CollectionRecord, "name" | "description" | "updatedAt">>
  ): Promise<CollectionRecord | undefined>;
  delete(id: string): Promise<boolean>;
  addItem(record: CollectionItemRecord): Promise<CollectionItemRecord>;
  removeItem(collectionId: string, itemId: string): Promise<boolean>;
  listItems(collectionId: string): Promise<CollectionItemRecord[]>;
}

export type ItemEventType =
  | "opened"
  | "marked_read"
  | "marked_unread"
  | "completed"
  | "archived"
  | "restored"
  | "collection_added"
  | "collection_removed"
  | "feedback_recorded"
  | "citation_clicked"
  | "resurfaced"
  | "resurfacing_dismissed";

export interface ItemEventRecord {
  id: string;
  eventKey: string;
  itemId: string;
  eventType: ItemEventType;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface ItemEventRepository {
  /** Append once by eventKey; retries return the original immutable event. */
  append(record: ItemEventRecord): Promise<ItemEventRecord>;
  listForItem(itemId: string, limit?: number): Promise<ItemEventRecord[]>;
}

export type DigestRunStatus = "pending" | "ready" | "degraded" | "failed";
export type DigestItemCategory = "priority" | "resurfaced";

export interface DigestItemRecord {
  digestRunId: string;
  itemId: string;
  category: DigestItemCategory;
  position: number;
  reason: string;
}

export interface DigestRunRecord {
  id: string;
  /** Single-user local calendar date in YYYY-MM-DD form. */
  digestDate: string;
  status: DigestRunStatus;
  createdAt: string;
  completedAt?: string;
  dismissedAt?: string;
}

export interface DigestRunWithItems extends DigestRunRecord {
  items: DigestItemRecord[];
}

export interface DigestRepository {
  create(run: DigestRunRecord, items?: DigestItemRecord[]): Promise<DigestRunWithItems>;
  findByDate(digestDate: string): Promise<DigestRunWithItems | undefined>;
  list(limit?: number): Promise<DigestRunWithItems[]>;
  updateStatus(
    id: string,
    status: DigestRunStatus,
    at: string
  ): Promise<DigestRunWithItems | undefined>;
  dismiss(id: string, at: string): Promise<DigestRunWithItems | undefined>;
}

export interface CaptureRecord extends CaptureReceipt {
  url: string;
  title?: string;
  notes?: string;
  topics: string[];
  priority: Priority;
  source: CaptureSource;
  lastErrorCode?: string;
  lastErrorMessage?: string;
}

export interface NewCaptureRecord {
  id: string;
  url: string;
  normalizedUrl: string;
  title?: string;
  notes?: string;
  topics: string[];
  priority: Priority;
  source: CaptureSource;
  createdAt: string;
}

export interface CaptureTransition {
  status: CaptureStatus;
  itemId?: string;
  retryable?: boolean;
  attempts?: number;
  errorCode?: string;
  errorMessage?: string;
  updatedAt: string;
}

export interface CaptureRepository {
  create(input: NewCaptureRecord): Promise<CaptureRecord>;
  findById(id: string): Promise<CaptureRecord | undefined>;
  findActiveOrReadyByNormalizedUrl(normalizedUrl: string): Promise<CaptureRecord | undefined>;
  list(limit?: number): Promise<CaptureRecord[]>;
  transition(
    id: string,
    allowedFrom: readonly CaptureStatus[],
    transition: CaptureTransition
  ): Promise<CaptureRecord | undefined>;
}

export interface CaptureTokenRecord {
  id: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface CaptureTokenRepository {
  create(record: CaptureTokenRecord): Promise<void>;
  findActiveByHash(tokenHash: string): Promise<CaptureTokenRecord | undefined>;
  list(): Promise<Omit<CaptureTokenRecord, "tokenHash">[]>;
  revoke(id: string, revokedAt: string): Promise<boolean>;
  touchLastUsed(id: string, usedAt: string): Promise<void>;
}

export interface RateLimitRepository {
  consume(input: {
    key: string;
    limit: number;
    windowSeconds: number;
    now: string;
  }): Promise<{ allowed: boolean; remaining: number; resetAt: string }>;
}

export interface OAuthTokenRecord {
  provider: string;
  teamId: string;
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
  email?: string;
  updatedAt: string;
}

export interface OAuthTokenRepository {
  find(provider: string, teamId?: string): Promise<OAuthTokenRecord | undefined>;
  listByProvider(provider: string): Promise<OAuthTokenRecord[]>;
  upsert(record: OAuthTokenRecord): Promise<void>;
  delete(provider: string, teamId?: string): Promise<void>;
}

export interface SummaryRecord {
  id: string;
  itemId: string;
  summary: string;
  model: string;
  promptType: string;
  createdAt: string;
}

export interface SummaryRepository {
  find(itemId: string, promptType?: "brief" | "detailed"): Promise<SummaryRecord | undefined>;
  findAll(itemId: string): Promise<{ brief?: string; detailed?: string }>;
  upsert(record: Omit<SummaryRecord, "createdAt">): Promise<SummaryRecord>;
  deleteForItem(itemId: string): Promise<void>;
}

export interface FeedbackRecord {
  id: string;
  itemId: string;
  rating: number;
  reason?: string;
  createdAt: string;
}

export interface FeedbackRepository {
  insert(record: Omit<FeedbackRecord, "createdAt">): Promise<FeedbackRecord>;
  findForItem(itemId: string): Promise<FeedbackRecord | undefined>;
  list(): Promise<FeedbackRecord[]>;
}

export interface ResearchReportRecord {
  id: string;
  itemId?: string;
  query: string;
  report: string;
  sources: string;
  model: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  progress?: string | null;
}

export interface ResearchSuggestionRecord {
  id: string;
  topicKey: string;
  topic: string;
  reason: string;
  suggestedQuery: string;
  sourceItemIds: string[];
  status: string;
  researchReportId?: string;
  createdAt: string;
}

export interface ResearchRepository {
  insertReport(
    input: Pick<ResearchReportRecord, "id" | "query" | "model"> & { itemId?: string }
  ): Promise<ResearchReportRecord>;
  findReport(id: string): Promise<ResearchReportRecord | undefined>;
  updateReport(
    id: string,
    patch: Partial<
      Pick<ResearchReportRecord, "report" | "sources" | "status" | "completedAt" | "progress">
    >
  ): Promise<ResearchReportRecord | undefined>;
  listReports(limit?: number): Promise<ResearchReportRecord[]>;
  listPendingSuggestions(): Promise<ResearchSuggestionRecord[]>;
  findSuggestion(id: string): Promise<ResearchSuggestionRecord | undefined>;
  replacePendingSuggestions(
    suggestions: Array<Omit<ResearchSuggestionRecord, "status" | "createdAt" | "researchReportId">>
  ): Promise<void>;
  dismissSuggestion(id: string): Promise<boolean>;
  markSuggestionStarted(id: string, researchReportId: string): Promise<boolean>;
}

export interface SettingsRepository {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

export interface NotificationRepository {
  insert(input: Pick<Notification, "id" | "itemId" | "title" | "message">): Promise<void>;
  find(id: string): Promise<Notification | undefined>;
  list(limit?: number): Promise<Notification[]>;
  unreadCount(): Promise<number>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
}

export interface EmbeddingRepository {
  find(
    itemId: string
  ): Promise<{ itemId: string; embedding: number[]; model: string; createdAt: string } | undefined>;
  upsert(itemId: string, embedding: number[], model: string): Promise<void>;
  listRecent(daysBack?: number): Promise<Array<{ itemId: string; embedding: number[] }>>;
}

export interface RawContentRepository {
  insert(input: {
    id: string;
    itemId?: string;
    sourceType: string;
    rawBody: string;
    metadata: Record<string, unknown>;
    fetchedAt: string;
  }): Promise<void>;
  attachItem(rawContentId: string, itemId: string): Promise<void>;
}

export interface ContentVersionCandidate {
  itemId: string;
  title: string;
  fullContent?: string;
  summary: string;
}

export interface NewItemContentVersion {
  id: string;
  itemId: string;
  contentHash: string;
  extractorVersion: string;
  source: ContentVersionSource;
  content: string;
  characterCount: number;
  tokenCount: number;
  createdAt: string;
}

export interface ContentVersionRepository {
  findById(id: string): Promise<ItemContentVersion | undefined>;
  findLatestForItem(itemId: string): Promise<ItemContentVersion | undefined>;
  listForItem(itemId: string): Promise<ItemContentVersion[]>;
  /** Inserts one immutable identity or returns the matching row from an earlier attempt. */
  create(record: NewItemContentVersion): Promise<{ record: ItemContentVersion; created: boolean }>;
  listReadyCandidates(input: {
    afterItemId?: string;
    limit: number;
  }): Promise<ContentVersionCandidate[]>;
}

export interface ContentChunkRepository {
  findById(id: string): Promise<ContentChunkRecord | undefined>;
  listForContentVersion(contentVersionId: string): Promise<ContentChunkRecord[]>;
  /** Inserts a complete chunk set in one transaction; existing deterministic chunks are retained. */
  insertMany(
    records: ContentChunkRecord[]
  ): Promise<{ records: ContentChunkRecord[]; insertedCount: number }>;
  listUnchunkedVersions(input: {
    afterContentVersionId?: string;
    limit: number;
  }): Promise<ItemContentVersion[]>;
}

export interface LegacySummaryCandidate {
  summaryId: string;
  itemId: string;
  contentVersionId: string;
  promptType: string;
  summary: string;
  model: string;
  createdAt: string;
}

export interface DegradedSummaryCandidate {
  itemId: string;
  title: string;
  contentVersionId: string;
  content: string;
}

export interface NewIntelligenceArtifact extends Omit<
  IntelligenceArtifact,
  "version" | "isCurrent" | "supersedesArtifactId"
> {
  makeCurrent: boolean;
  /** Publishes as current only when no valid current artifact exists, without skipping history. */
  makeCurrentIfNone?: boolean;
}

export interface IntelligenceArtifactRepository {
  findById(id: string): Promise<IntelligenceArtifact | undefined>;
  findCurrent(
    itemId: string,
    artifactType: IntelligenceArtifact["artifactType"]
  ): Promise<IntelligenceArtifact | undefined>;
  listForItem(itemId: string): Promise<IntelligenceArtifact[]>;
  /** Publishes a new version and stales the previous current version atomically. */
  publish(
    record: NewIntelligenceArtifact
  ): Promise<{ record: IntelligenceArtifact; created: boolean }>;
  /** Stores validated output on a pending artifact before dependent rows are published. */
  updatePending(
    id: string,
    patch: Pick<
      IntelligenceArtifact,
      "content" | "contentHash" | "promptVersion" | "provider" | "model" | "metadata" | "updatedAt"
    >
  ): Promise<IntelligenceArtifact | undefined>;
  /** Completes a pending artifact and optionally promotes it, retaining any prior current on failure. */
  complete(
    id: string,
    completion: Pick<
      IntelligenceArtifact,
      | "status"
      | "content"
      | "contentHash"
      | "promptVersion"
      | "provider"
      | "model"
      | "metadata"
      | "errorCode"
      | "errorMessage"
      | "updatedAt"
      | "completedAt"
    > & { makeCurrent: boolean }
  ): Promise<IntelligenceArtifact | undefined>;
  listLegacySummaryCandidates(input: {
    afterSummaryId?: string;
    limit: number;
  }): Promise<LegacySummaryCandidate[]>;
  listDegradedSummaryCandidates(input: {
    afterItemId?: string;
    limit: number;
  }): Promise<DegradedSummaryCandidate[]>;
}

export interface ClaimRepository {
  listForArtifact(artifactId: string): Promise<GroundedClaim[]>;
  /** Validates and inserts claims plus exact evidence spans in one transaction. */
  insertWithEvidence(
    claims: Array<Omit<GroundedClaim, "evidence"> & { evidence: ClaimEvidence[] }>
  ): Promise<GroundedClaim[]>;
}

export interface BackfillAdvance {
  expectedCursor?: string;
  cursor?: string;
  checkpoint: Record<string, unknown>;
  processedDelta: number;
  completed: boolean;
  at: string;
}

export interface KnowledgeBackfillRepository {
  find(jobKey: string): Promise<KnowledgeBackfillCheckpoint | undefined>;
  create(checkpoint: KnowledgeBackfillCheckpoint): Promise<KnowledgeBackfillCheckpoint>;
  /** Starts a pending/failed attempt. Calling start on a running checkpoint is idempotent. */
  start(jobKey: string, at: string): Promise<KnowledgeBackfillCheckpoint | undefined>;
  /** Compare-and-set cursor advancement prevents duplicate workers from double-counting a batch. */
  advance(
    jobKey: string,
    advance: BackfillAdvance
  ): Promise<KnowledgeBackfillCheckpoint | undefined>;
  fail(jobKey: string, error: string, at: string): Promise<KnowledgeBackfillCheckpoint | undefined>;
  listByType(
    jobType: KnowledgeBackfillType,
    limit?: number
  ): Promise<KnowledgeBackfillCheckpoint[]>;
}

export interface PublisherQueueEntry {
  publisherId: string;
  url: string;
  discoveredAt: string;
  status: "pending" | "fetched" | "failed";
  attempts: number;
  lastError?: string;
}

export interface PublisherQueueRepository {
  enqueue(publisherId: string, url: string): Promise<void>;
  listPending(publisherId: string, limit?: number): Promise<PublisherQueueEntry[]>;
  markFetched(publisherId: string, url: string): Promise<void>;
  markFailed(publisherId: string, url: string, error: string, maxAttempts?: number): Promise<void>;
  getStats(publisherId: string): Promise<{ pending: number; fetched: number; failed: number }>;
}

export interface JobQueueRepository {
  enqueue(input: {
    id: string;
    jobType: string;
    payload?: string;
    priority?: number;
    maxRetries?: number;
    runAfter?: string;
  }): Promise<void>;
  dequeue(workerId: string): Promise<Record<string, unknown> | undefined>;
  complete(id: string, error?: string): Promise<void>;
  getStats(): Promise<{ pending: number; running: number; completed: number; failed: number }>;
}

export interface AgentRepository {
  insertAuditLog(data: Record<string, unknown> & { id: string; action: string }): Promise<void>;
  listAuditLogs(limit?: number): Promise<Array<Record<string, unknown>>>;
  getDailyAuditStats(): Promise<{ totalCost: number; totalCalls: number; totalTokens: number }>;
  insertWorkflow(
    data: Record<string, unknown> & { id: string; workflowType: string }
  ): Promise<void>;
  updateWorkflow(id: string, patch: Record<string, unknown>): Promise<void>;
  findWorkflow(id: string): Promise<Record<string, unknown> | undefined>;
  listWorkflows(filters?: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
  insertAction(data: Record<string, unknown> & { id: string; actionType: string }): Promise<void>;
  listActions(filters?: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
  insertApproval(data: Record<string, unknown> & { id: string; actionType: string }): Promise<void>;
  listPendingApprovals(limit?: number): Promise<Array<Record<string, unknown>>>;
  resolveApproval(id: string, status: "approved" | "rejected"): Promise<void>;
  insertConversation(data: { id: string; title?: string }): Promise<void>;
  insertMessage(
    data: Record<string, unknown> & { id: string; conversationId: string }
  ): Promise<void>;
  listMessages(conversationId: string): Promise<Array<Record<string, unknown>>>;
  listConversations(limit?: number): Promise<Array<Record<string, unknown>>>;
}

export interface RepositorySet {
  auth: AuthRepositoryPort;
  items: ItemRepository;
  itemNotes: ItemNoteRepository;
  annotations: AnnotationRepository;
  collections: CollectionRepository;
  itemEvents: ItemEventRepository;
  digests: DigestRepository;
  captures: CaptureRepository;
  captureTokens: CaptureTokenRepository;
  rateLimits: RateLimitRepository;
  oauthTokens: OAuthTokenRepository;
  summaries: SummaryRepository;
  feedback: FeedbackRepository;
  research: ResearchRepository;
  settings: SettingsRepository;
  notifications: NotificationRepository;
  embeddings: EmbeddingRepository;
  rawContent: RawContentRepository;
  contentVersions: ContentVersionRepository;
  contentChunks: ContentChunkRepository;
  intelligenceArtifacts: IntelligenceArtifactRepository;
  claims: ClaimRepository;
  knowledgeBackfills: KnowledgeBackfillRepository;
  publisherQueue: PublisherQueueRepository;
  jobs: JobQueueRepository;
  agent: AgentRepository;
}

export interface ControlPlaneAccountRepository {
  /** Returns opaque account ids only; the control plane cannot read tenant content. */
  listActiveUserIds(input: { afterUserId?: UserId; limit: number }): Promise<UserId[]>;
  /** Enumerates lifecycle work without exposing export payloads or personal rows. */
  listDeletionWork(input: {
    before: string;
    limit: number;
  }): Promise<Array<{ deletionId: string; userId: UserId }>>;
}

export interface ControlPlaneRepositorySet {
  auth: AuthRepositoryPort;
  accounts: ControlPlaneAccountRepository;
}
