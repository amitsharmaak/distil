import type { CaptureReceipt, CaptureSource, CaptureStatus } from "@/lib/contracts/capture";
import type { ContentItem, Notification, Priority } from "@/lib/types";

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
  progress?: string;
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
  items: ItemRepository;
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
  agent: AgentRepository;
}
