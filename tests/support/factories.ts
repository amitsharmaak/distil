import type { ContentItem } from "@/lib/types";

export type CaptureSource = "web" | "ios-shortcut" | "browser-extension";
export type CaptureStatus = "queued" | "processing" | "ready" | "rejected" | "failed";

export interface CaptureRequestFixture {
  url: string;
  title?: string;
  notes?: string;
  topics?: string[];
  priority?: "high" | "medium" | "low";
  source: CaptureSource;
}

export interface CaptureReceiptFixture {
  id: string;
  normalizedUrl: string;
  status: CaptureStatus;
  itemId?: string;
  retryable: boolean;
  attempts: number;
  error?: {
    code: string;
    message: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CaptureQueueMessageFixture {
  version: 1;
  captureId: string;
}

type FactoryOverrides<T> = Partial<T> | ((sequence: number) => Partial<T>);

export interface TestFactory<T> {
  build(overrides?: FactoryOverrides<T>): T;
  buildList(count: number, overrides?: FactoryOverrides<T>): T[];
  reset(): void;
}

/** Define a repeatable, type-safe factory with a resettable sequence. */
export function defineFactory<T>(builder: (sequence: number) => T): TestFactory<T> {
  let sequence = 0;

  const build = (overrides: FactoryOverrides<T> = {}): T => {
    const current = sequence++;
    const base = builder(current);
    const resolvedOverrides = typeof overrides === "function" ? overrides(current) : overrides;
    return { ...base, ...resolvedOverrides };
  };

  return {
    build,
    buildList(count, overrides = {}) {
      if (!Number.isInteger(count) || count < 0) {
        throw new RangeError("Factory list count must be a non-negative integer");
      }
      return Array.from({ length: count }, () => build(overrides));
    },
    reset() {
      sequence = 0;
    },
  };
}

const BASE_TIME_MS = Date.parse("2026-01-15T10:00:00.000Z");

export const contentItemFactory = defineFactory<ContentItem>((sequence) => ({
  id: `item-${sequence + 1}`,
  title: `Fixture article ${sequence + 1}`,
  summary: "A deterministic content item for tests.",
  fullContent: "Fixture article content.",
  sourceType: "manual",
  contentType: "article",
  topics: ["testing"],
  url: `https://articles.example.test/article-${sequence + 1}`,
  priority: "medium",
  isRead: false,
  createdAt: new Date(BASE_TIME_MS + sequence * 1_000).toISOString(),
  processingStatus: "ready",
}));

export const captureRequestFactory = defineFactory<CaptureRequestFixture>((sequence) => ({
  url: `https://articles.example.test/article-${sequence + 1}`,
  title: `Capture ${sequence + 1}`,
  source: "web",
}));

export const captureReceiptFactory = defineFactory<CaptureReceiptFixture>((sequence) => {
  const timestamp = new Date(BASE_TIME_MS + sequence * 1_000).toISOString();
  return {
    id: `00000000-0000-4000-8000-${String(sequence + 1).padStart(12, "0")}`,
    normalizedUrl: `https://articles.example.test/article-${sequence + 1}`,
    status: "queued",
    retryable: false,
    attempts: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
});

export const captureQueueMessageFactory = defineFactory<CaptureQueueMessageFixture>((sequence) => ({
  version: 1,
  captureId: `00000000-0000-4000-8000-${String(sequence + 1).padStart(12, "0")}`,
}));

/** Reset every shared factory at test boundaries. */
export function resetFactories(): void {
  contentItemFactory.reset();
  captureRequestFactory.reset();
  captureReceiptFactory.reset();
  captureQueueMessageFactory.reset();
}
