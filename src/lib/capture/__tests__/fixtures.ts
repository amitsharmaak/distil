import type {
  CaptureRecord,
  CaptureRepository,
  CaptureTransition,
  NewCaptureRecord,
} from "@/lib/repositories/ports";

export function captureRecord(patch: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    url: "https://example.com/article",
    normalizedUrl: "https://example.com/article",
    topics: [],
    priority: "medium",
    source: "web",
    status: "queued",
    retryable: false,
    attempts: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

export class MemoryCaptureRepository implements CaptureRepository {
  readonly records = new Map<string, CaptureRecord>();
  failCreate = false;

  constructor(records: CaptureRecord[] = []) {
    for (const record of records) this.records.set(record.id, structuredClone(record));
  }

  async create(input: NewCaptureRecord): Promise<CaptureRecord> {
    if (this.failCreate) throw new Error("unique constraint");
    if ([...this.records.values()].some((v) => v.normalizedUrl === input.normalizedUrl)) {
      throw new Error("unique constraint");
    }
    const record = captureRecord({
      ...input,
      status: "queued",
      retryable: false,
      attempts: 0,
      updatedAt: input.createdAt,
    });
    this.records.set(record.id, record);
    return structuredClone(record);
  }

  async findById(id: string): Promise<CaptureRecord | undefined> {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }

  async findActiveOrReadyByNormalizedUrl(url: string): Promise<CaptureRecord | undefined> {
    const record = [...this.records.values()].find(
      (v) => v.normalizedUrl === url && ["queued", "processing", "ready"].includes(v.status)
    );
    return record ? structuredClone(record) : undefined;
  }

  async list(limit = 50): Promise<CaptureRecord[]> {
    return [...this.records.values()].slice(0, limit).map((v) => structuredClone(v));
  }

  async transition(
    id: string,
    allowedFrom: readonly CaptureRecord["status"][],
    transition: CaptureTransition
  ): Promise<CaptureRecord | undefined> {
    const record = this.records.get(id);
    if (!record || !allowedFrom.includes(record.status)) return undefined;
    const next: CaptureRecord = {
      ...record,
      status: transition.status,
      itemId: transition.itemId ?? record.itemId,
      retryable: transition.retryable ?? record.retryable,
      attempts: transition.attempts ?? record.attempts,
      lastErrorCode: transition.errorCode,
      lastErrorMessage: transition.errorMessage,
      error: transition.errorCode
        ? { code: transition.errorCode, message: transition.errorMessage ?? "" }
        : undefined,
      updatedAt: transition.updatedAt,
    };
    this.records.set(id, next);
    return structuredClone(next);
  }
}

export const publicDns = async () => [{ address: "93.184.216.34", family: 4 }] as const;
