import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { parseAuthContext, type AuthContext } from "@/lib/contracts/tenant-context";

import type {
  DigestCandidate,
  DigestItem,
  DigestJob,
  DigestRun,
  DigestStore,
  PersonalPreferences,
} from "./types";

const selectionVersion = "deterministic-v1";

const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((timezone) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }, "must be a valid IANA timezone");

export const preferencesUpdateSchema = z
  .object({
    digestEnabled: z.boolean().optional(),
    digestTimezone: timezoneSchema.optional(),
    personalizationEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "at least one preference is required");

export const digestPreferencesSchema = z
  .object({
    digestEnabled: z.boolean().optional(),
    digestTimezone: timezoneSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "at least one digest preference is required");

export const runDigestSchema = z
  .object({
    action: z.literal("run").optional(),
    localDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    idempotencyKey: z.string().trim().min(1).max(128),
  })
  .strict();

export const dismissDigestSchema = z
  .object({ action: z.literal("dismiss"), digestId: z.string().trim().min(1).max(128) })
  .strict();

export const dismissDigestItemSchema = z
  .object({
    action: z.literal("dismiss_item"),
    digestId: z.string().trim().min(1).max(128),
    itemId: z.string().trim().min(1).max(128),
  })
  .strict();

export class DigestError extends Error {
  constructor(
    readonly code:
      | "INVALID_REQUEST"
      | "DIGEST_DISABLED"
      | "DIGEST_NOT_FOUND"
      | "DIGEST_ITEM_NOT_FOUND",
    readonly status: 400 | 404 | 409,
    message: string
  ) {
    super(message);
    this.name = "DigestError";
  }
}

export function localDateFor(timezone: string, now = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((value) => value.type === type)?.value;
    const year = part("year");
    const month = part("month");
    const day = part("day");
    if (!year || !month || !day) throw new Error("date parts unavailable");
    return `${year}-${month}-${day}`;
  } catch {
    throw new DigestError("INVALID_REQUEST", 400, "digestTimezone must be a valid IANA timezone");
  }
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 40)}`;
}

function candidateItem(
  candidate: DigestCandidate,
  category: DigestItem["category"],
  position: number
): Omit<DigestItem, "digestRunId"> {
  const summary = candidate.summary.trim() || `Saved ${candidate.createdAt.slice(0, 10)}.`;
  return {
    itemId: candidate.id,
    category,
    position,
    reason:
      category === "priority"
        ? `Unread ${candidate.manualPriority ?? candidate.priority} priority item.`
        : "Unread or saved item selected for deliberate resurfacing.",
    title: candidate.title,
    summary,
    selectionMetadata: {
      selectionVersion,
      category,
      effectivePriority: candidate.manualPriority ?? candidate.priority,
      createdAt: candidate.createdAt,
      deterministicSummary: !candidate.summary.trim(),
    },
  };
}

function pick(
  candidates: DigestCandidate[],
  count: number,
  selected: Set<string>
): DigestCandidate[] {
  return candidates.filter((candidate) => !selected.has(candidate.id)).slice(0, count);
}

export function selectDigestItems(
  priorityCandidates: DigestCandidate[],
  resurfacedCandidates: DigestCandidate[]
): Omit<DigestItem, "digestRunId">[] {
  const selected = new Set<string>();
  const picks: Array<{ candidate: DigestCandidate; category: DigestItem["category"] }> = [];
  const add = (candidates: DigestCandidate[], count: number, category: DigestItem["category"]) => {
    for (const candidate of pick(candidates, count, selected)) {
      selected.add(candidate.id);
      picks.push({ candidate, category });
    }
  };
  add(priorityCandidates, 3, "priority");
  add(resurfacedCandidates, 2, "resurfaced");
  add(priorityCandidates, 5 - picks.length, "priority");
  add(resurfacedCandidates, 5 - picks.length, "resurfaced");
  return picks.map(({ candidate, category }, position) =>
    candidateItem(candidate, category, position)
  );
}

export async function runDigest(
  context: AuthContext,
  store: DigestStore,
  input: z.infer<typeof runDigestSchema>,
  now = new Date()
): Promise<DigestRun> {
  const tenant = parseAuthContext(context);
  const preferences = await store.getPreferences();
  if (!preferences.digestEnabled) {
    throw new DigestError("DIGEST_DISABLED", 409, "Enable in-app digests before running one");
  }
  const localDate = input.localDate ?? localDateFor(preferences.digestTimezone, now);
  const existing = await store.findDigest(localDate);
  if (existing) return existing;
  const [priority, resurfaced] = await Promise.all([
    store.listPriorityCandidates(),
    store.listResurfacedCandidates(),
  ]);
  const id = stableId("digest", `${tenant.userId}:${localDate}:${input.idempotencyKey}`);
  const items = selectDigestItems(priority, resurfaced).map((item) => ({
    ...item,
    digestRunId: id,
  }));
  const timestamp = now.toISOString();
  return store.createDigest({
    id,
    localDate,
    timezone: preferences.digestTimezone,
    status: "degraded",
    contentMode: "deterministic",
    selectionVersion,
    selectionMetadata: {
      selectionVersion,
      priorityCandidateCount: priority.length,
      resurfacedCandidateCount: resurfaced.length,
      idempotencyKeyHash: createHash("sha256").update(input.idempotencyKey).digest("hex"),
    },
    title: `Your digest for ${localDate}`,
    summary: items.length
      ? `A deterministic selection of ${items.length} item${items.length === 1 ? "" : "s"} for today.`
      : "No eligible unread or resurfaced items today.",
    createdAt: timestamp,
    completedAt: timestamp,
    items,
  });
}

export async function dismissDigest(
  context: AuthContext,
  store: DigestStore,
  digestId: string,
  now = new Date()
): Promise<DigestRun> {
  parseAuthContext(context);
  const digest = await store.dismissDigest(digestId, now.toISOString());
  if (!digest) throw new DigestError("DIGEST_NOT_FOUND", 404, "Digest was not found");
  return digest;
}

export async function dismissDigestItem(
  context: AuthContext,
  store: DigestStore,
  digestId: string,
  itemId: string,
  now = new Date()
): Promise<DigestItem> {
  parseAuthContext(context);
  const item = await store.dismissDigestItem(digestId, itemId, now.toISOString());
  if (!item) {
    throw new DigestError("DIGEST_ITEM_NOT_FOUND", 404, "Digest item was not found");
  }
  return item;
}

export async function enqueueDigest(
  context: AuthContext,
  store: DigestStore,
  preferences: PersonalPreferences,
  requestedBy: DigestJob["requestedBy"],
  now = new Date()
): Promise<DigestJob | undefined> {
  const tenant = parseAuthContext(context);
  if (!preferences.digestEnabled) return undefined;
  const localDate = localDateFor(preferences.digestTimezone, now);
  return store.enqueue({
    id: randomUUID(),
    localDate,
    idempotencyKey: `digest:${tenant.userId}:${localDate}`,
    status: "queued",
    requestedBy,
    createdAt: now.toISOString(),
  });
}
