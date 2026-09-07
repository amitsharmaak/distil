import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  AnnotationRecord,
  CollectionItemRecord,
  CollectionRecord,
  ItemEventRecord,
  ItemNoteRecord,
  RepositorySet,
} from "@/lib/repositories/ports";
import type { ContentItem } from "@/lib/types";

const isoNow = () => new Date().toISOString();

export const prioritySchema = z.enum(["high", "medium", "low"]);
export const stateSchema = z
  .object({
    isRead: z.boolean().optional(),
    archived: z.boolean().optional(),
    readingProgress: z
      .number()
      .finite()
      .refine((value) => [0, 0.25, 0.5, 0.75, 1].includes(value), "must be a reading milestone")
      .optional(),
    manualPriority: prioritySchema.nullable().optional(),
    idempotencyKey: z.string().trim().min(1).max(128).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.isRead !== undefined ||
      value.archived !== undefined ||
      value.readingProgress !== undefined ||
      value.manualPriority !== undefined,
    "at least one state field is required"
  );

export const noteSchema = z.object({ body: z.string().max(100_000) }).strict();

export const annotationCreateSchema = z
  .object({
    selectedQuote: z.string().trim().min(1).max(20_000),
    prefix: z.string().max(2_000).default(""),
    suffix: z.string().max(2_000).default(""),
    contentHash: z.string().trim().min(1).max(256),
    contentVersion: z.string().trim().min(1).max(256),
    comment: z.string().max(20_000).nullable().optional(),
    idempotencyKey: z.string().trim().min(1).max(128).optional(),
    startOffset: z.number().int().nonnegative().optional(),
    endOffset: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (value) =>
      (value.startOffset === undefined && value.endOffset === undefined) ||
      (value.startOffset !== undefined &&
        value.endOffset !== undefined &&
        value.endOffset > value.startOffset),
    "startOffset and endOffset must be provided together and endOffset must be greater"
  );

export const annotationUpdateSchema = z
  .object({
    selectedQuote: z.string().trim().min(1).max(20_000).optional(),
    prefix: z.string().max(2_000).optional(),
    suffix: z.string().max(2_000).optional(),
    contentHash: z.string().trim().min(1).max(256).optional(),
    contentVersion: z.string().trim().min(1).max(256).optional(),
    comment: z.string().max(20_000).nullable().optional(),
    status: z.enum(["active", "orphaned"]).optional(),
    startOffset: z.number().int().nonnegative().nullable().optional(),
    endOffset: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "at least one annotation field is required")
  .refine(
    (value) =>
      (value.startOffset === undefined) === (value.endOffset === undefined) &&
      (value.startOffset === undefined ||
        value.startOffset === null ||
        value.endOffset === null ||
        (value.endOffset !== undefined && value.endOffset > value.startOffset)),
    "startOffset and endOffset must be provided together and endOffset must be greater"
  );

export const collectionCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(20_000).nullable().optional(),
    idempotencyKey: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export const collectionUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(20_000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "at least one collection field is required");

export const membershipSchema = z
  .object({ position: z.number().int().nonnegative().optional() })
  .strict();

export class ReaderError extends Error {
  constructor(
    readonly code:
      | "INVALID_REQUEST"
      | "ITEM_NOT_FOUND"
      | "ANNOTATION_NOT_FOUND"
      | "COLLECTION_NOT_FOUND"
      | "CONFLICT",
    readonly status: 400 | 404 | 409,
    message: string
  ) {
    super(message);
    this.name = "ReaderError";
  }
}

export function parseBody<T>(value: unknown, schema: z.ZodType<T>): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ReaderError(
      "INVALID_REQUEST",
      400,
      result.error.issues[0]?.message ?? "Invalid request"
    );
  }
  return result.data;
}

function deterministicId(prefix: string, idempotencyKey: string): string {
  return `${prefix}-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 40)}`;
}

function requireItem(item: ContentItem | undefined, id: string): ContentItem {
  if (!item) throw new ReaderError("ITEM_NOT_FOUND", 404, `Item with id "${id}" was not found`);
  return item;
}

function event(
  itemId: string,
  eventType: ItemEventRecord["eventType"],
  metadata: Record<string, unknown>,
  key?: string
): ItemEventRecord {
  return {
    id: randomUUID(),
    eventKey: key ?? `${itemId}:${eventType}:${randomUUID()}`,
    itemId,
    eventType,
    metadata,
    occurredAt: isoNow(),
  };
}

export async function updateItemState(
  repositories: RepositorySet,
  itemId: string,
  input: z.infer<typeof stateSchema>
): Promise<ContentItem> {
  const current = requireItem(await repositories.items.findById(itemId), itemId);
  const patch: Partial<ContentItem> = {};
  const events: ItemEventRecord[] = [];
  const now = isoNow();

  if (input.isRead !== undefined && input.isRead !== current.isRead) {
    patch.isRead = input.isRead;
    patch.readAt = input.isRead ? now : undefined;
    events.push(
      event(
        itemId,
        input.isRead ? "marked_read" : "marked_unread",
        { isRead: input.isRead },
        input.idempotencyKey ? `${itemId}:${input.idempotencyKey}:read` : undefined
      )
    );
  }
  if (input.archived !== undefined && input.archived !== Boolean(current.archivedAt)) {
    patch.archivedAt = input.archived ? now : undefined;
    events.push(
      event(
        itemId,
        input.archived ? "archived" : "restored",
        {},
        input.idempotencyKey ? `${itemId}:${input.idempotencyKey}:archive` : undefined
      )
    );
  }
  if (input.readingProgress !== undefined && input.readingProgress !== current.readingProgress) {
    patch.readingProgress = input.readingProgress;
    if (input.readingProgress === 1 && !current.isRead && input.isRead === undefined) {
      patch.isRead = true;
      patch.readAt = now;
      events.push(
        event(
          itemId,
          "completed",
          { readingProgress: 1 },
          input.idempotencyKey ? `${itemId}:${input.idempotencyKey}:completed` : undefined
        )
      );
    }
  }
  if (
    input.manualPriority !== undefined &&
    input.manualPriority !== (current.manualPriority ?? null)
  ) {
    patch.manualPriority = input.manualPriority ?? undefined;
  }

  const updated = requireItem(await repositories.items.update(itemId, patch), itemId);
  for (const itemEvent of events) await repositories.itemEvents.append(itemEvent);
  return updated;
}

export async function getNote(
  repositories: RepositorySet,
  itemId: string
): Promise<ItemNoteRecord | undefined> {
  requireItem(await repositories.items.findById(itemId), itemId);
  return repositories.itemNotes.find(itemId);
}

export async function putNote(
  repositories: RepositorySet,
  itemId: string,
  body: string
): Promise<ItemNoteRecord> {
  requireItem(await repositories.items.findById(itemId), itemId);
  const now = isoNow();
  return repositories.itemNotes.upsert({
    itemId,
    body,
    createdAt: (await repositories.itemNotes.find(itemId))?.createdAt ?? now,
    updatedAt: now,
  });
}

export async function deleteNote(repositories: RepositorySet, itemId: string): Promise<void> {
  requireItem(await repositories.items.findById(itemId), itemId);
  await repositories.itemNotes.delete(itemId);
}

export async function listAnnotations(
  repositories: RepositorySet,
  itemId: string
): Promise<AnnotationRecord[]> {
  requireItem(await repositories.items.findById(itemId), itemId);
  return repositories.annotations.listForItem(itemId);
}

export async function createAnnotation(
  repositories: RepositorySet,
  itemId: string,
  input: z.infer<typeof annotationCreateSchema>
): Promise<AnnotationRecord> {
  requireItem(await repositories.items.findById(itemId), itemId);
  const id = input.idempotencyKey
    ? deterministicId("annotation", `${itemId}:${input.idempotencyKey}`)
    : randomUUID();
  const existing = (await repositories.annotations.listForItem(itemId)).find(
    (annotation) => annotation.id === id
  );
  if (existing) return existing;
  try {
    return await repositories.annotations.create({
      id,
      itemId,
      selectedQuote: input.selectedQuote,
      prefix: input.prefix,
      suffix: input.suffix,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      contentHash: input.contentHash,
      contentVersion: input.contentVersion,
      comment: input.comment ?? undefined,
      status: "active",
      createdAt: isoNow(),
      updatedAt: isoNow(),
    });
  } catch (error) {
    throw new ReaderError(
      "CONFLICT",
      409,
      error instanceof Error ? error.message : "Annotation already exists"
    );
  }
}

async function annotationForItem(
  repositories: RepositorySet,
  itemId: string,
  annotationId: string
): Promise<AnnotationRecord> {
  requireItem(await repositories.items.findById(itemId), itemId);
  const annotation = (await repositories.annotations.listForItem(itemId)).find(
    (value) => value.id === annotationId
  );
  if (!annotation)
    throw new ReaderError(
      "ANNOTATION_NOT_FOUND",
      404,
      `Annotation with id "${annotationId}" was not found`
    );
  return annotation;
}

export async function updateAnnotation(
  repositories: RepositorySet,
  itemId: string,
  annotationId: string,
  input: z.infer<typeof annotationUpdateSchema>
): Promise<AnnotationRecord> {
  await annotationForItem(repositories, itemId, annotationId);
  const patch: Parameters<RepositorySet["annotations"]["update"]>[1] = { updatedAt: isoNow() };
  if (input.selectedQuote !== undefined) patch.selectedQuote = input.selectedQuote;
  if (input.prefix !== undefined) patch.prefix = input.prefix;
  if (input.suffix !== undefined) patch.suffix = input.suffix;
  if (input.contentHash !== undefined) patch.contentHash = input.contentHash;
  if (input.contentVersion !== undefined) patch.contentVersion = input.contentVersion;
  if (input.comment !== undefined)
    patch.comment = input.comment === null ? undefined : input.comment;
  if (input.status !== undefined) patch.status = input.status;
  if (input.startOffset !== undefined)
    patch.startOffset = input.startOffset === null ? undefined : input.startOffset;
  if (input.endOffset !== undefined)
    patch.endOffset = input.endOffset === null ? undefined : input.endOffset;
  const updated = await repositories.annotations.update(annotationId, patch);
  if (!updated)
    throw new ReaderError(
      "ANNOTATION_NOT_FOUND",
      404,
      `Annotation with id "${annotationId}" was not found`
    );
  return updated;
}

export async function deleteAnnotation(
  repositories: RepositorySet,
  itemId: string,
  annotationId: string
): Promise<void> {
  await annotationForItem(repositories, itemId, annotationId);
  if (!(await repositories.annotations.delete(annotationId)))
    throw new ReaderError(
      "ANNOTATION_NOT_FOUND",
      404,
      `Annotation with id "${annotationId}" was not found`
    );
}

export async function listCollections(repositories: RepositorySet): Promise<CollectionRecord[]> {
  return repositories.collections.list();
}

export async function createCollection(
  repositories: RepositorySet,
  input: z.infer<typeof collectionCreateSchema>
): Promise<CollectionRecord> {
  const id = input.idempotencyKey
    ? deterministicId("collection", input.idempotencyKey)
    : randomUUID();
  const existing = await repositories.collections.find(id);
  if (existing) return existing;
  try {
    return await repositories.collections.create({
      id,
      name: input.name,
      description: input.description ?? undefined,
      createdAt: isoNow(),
      updatedAt: isoNow(),
    });
  } catch (error) {
    throw new ReaderError(
      "CONFLICT",
      409,
      error instanceof Error ? error.message : "Collection already exists"
    );
  }
}

export async function getCollection(
  repositories: RepositorySet,
  id: string
): Promise<{ collection: CollectionRecord; items: CollectionItemRecord[] }> {
  const collection = await repositories.collections.find(id);
  if (!collection)
    throw new ReaderError("COLLECTION_NOT_FOUND", 404, `Collection with id "${id}" was not found`);
  return { collection, items: await repositories.collections.listItems(id) };
}

export async function updateCollection(
  repositories: RepositorySet,
  id: string,
  input: z.infer<typeof collectionUpdateSchema>
): Promise<CollectionRecord> {
  const updated = await repositories.collections.update(id, {
    ...input,
    description: input.description ?? undefined,
    updatedAt: isoNow(),
  });
  if (!updated)
    throw new ReaderError("COLLECTION_NOT_FOUND", 404, `Collection with id "${id}" was not found`);
  return updated;
}

export async function deleteCollection(repositories: RepositorySet, id: string): Promise<void> {
  if (!(await repositories.collections.delete(id)))
    throw new ReaderError("COLLECTION_NOT_FOUND", 404, `Collection with id "${id}" was not found`);
}

export async function addCollectionItem(
  repositories: RepositorySet,
  collectionId: string,
  itemId: string,
  position = 0
): Promise<CollectionItemRecord> {
  const collection = await repositories.collections.find(collectionId);
  if (!collection)
    throw new ReaderError(
      "COLLECTION_NOT_FOUND",
      404,
      `Collection with id "${collectionId}" was not found`
    );
  requireItem(await repositories.items.findById(itemId), itemId);
  const existing = (await repositories.collections.listItems(collectionId)).find(
    (value) => value.itemId === itemId
  );
  const record = await repositories.collections.addItem({
    collectionId,
    itemId,
    position: position ?? existing?.position ?? 0,
    addedAt: existing?.addedAt ?? isoNow(),
  });
  await repositories.itemEvents.append(
    event(
      itemId,
      "collection_added",
      { collectionId, position: record.position },
      `${collectionId}:${itemId}:added:${record.addedAt}`
    )
  );
  return record;
}

export async function removeCollectionItem(
  repositories: RepositorySet,
  collectionId: string,
  itemId: string
): Promise<void> {
  const collection = await repositories.collections.find(collectionId);
  if (!collection)
    throw new ReaderError(
      "COLLECTION_NOT_FOUND",
      404,
      `Collection with id "${collectionId}" was not found`
    );
  const removedAt = isoNow();
  if (!(await repositories.collections.removeItem(collectionId, itemId))) return;
  await repositories.itemEvents.append(
    event(
      itemId,
      "collection_removed",
      { collectionId },
      `${collectionId}:${itemId}:removed:${removedAt}`
    )
  );
}
