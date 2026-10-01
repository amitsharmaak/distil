"use client";

import { useCallback, useEffect, useState } from "react";
import type { LifeArea, Priority } from "@/lib/types";
import { contentMutationRequest } from "./mutation-request";
import { CACHE_FRESHNESS, useContentCache, useContentQuery } from "./content-cache";

export interface ItemPatch {
  isRead?: boolean;
  archived?: boolean;
  area?: LifeArea;
  manualPriority?: Priority | null;
  readingProgress?: number;
}
type ItemValue = Record<string, unknown>;
const families = [["feed"], ["today"], ["library", "archive"]] as const;
const queues = new WeakMap<object, Map<string, Promise<void>>>();

/** Only item-bearing fields in our feed, Today and archive envelopes are traversed. */
export function mapCachedItem(
  value: unknown,
  id: string,
  change: (item: ItemValue) => ItemValue
): unknown {
  if (Array.isArray(value)) return value.map((entry) => mapCachedItem(entry, id, change));
  if (!value || typeof value !== "object") return value;
  const object = value as ItemValue;
  if (object.id === id) return change(object);
  const next = { ...object };
  for (const field of ["items", "item", "results", "sections", "priority", "revisiting"]) {
    if (field in object) next[field] = mapCachedItem(object[field], id, change);
  }
  return next;
}

/** A small override survives RSC route reuse, so old reader props cannot undo a local edit. */
export function useItemOverrides(id: string) {
  const query = useContentQuery<ItemPatch>({
    key: ["item", id, "changes"],
    url: "",
    staleTime: CACHE_FRESHNESS.detail,
    enabled: false,
  });
  const [expiredVersion, setExpiredVersion] = useState(0);
  useEffect(() => {
    if (!query.dataUpdatedAt) return;
    const timer = setTimeout(
      () => setExpiredVersion(query.dataUpdatedAt),
      Math.max(0, query.dataUpdatedAt + CACHE_FRESHNESS.detail - Date.now())
    );
    return () => clearTimeout(timer);
  }, [query.dataUpdatedAt]);
  return expiredVersion === query.dataUpdatedAt ? undefined : query.data;
}

export function useItemMutation() {
  const cache = useContentCache();
  const updateItem = useCallback(
    (id: string, patch: ItemPatch): Promise<void> => {
      let queue = queues.get(cache);
      if (!queue) {
        queue = new Map();
        queues.set(cache, queue);
      }
      const previous = queue.get(id) ?? Promise.resolve();
      const operation = previous
        .catch(() => undefined)
        .then(async () => {
          const release = cache.beginWrite();
          await Promise.all([
            ...families.map((family) => cache.cancel(family)),
            cache.cancel(["item", id, "state"]),
          ]);
          const snapshots = families.flatMap((family) => cache.entries(family));
          const overrideKey = ["item", id, "changes"];
          const oldOverride = cache.get<ItemPatch>(overrideKey);
          const changed: ItemValue = {
            ...patch,
            ...(patch.archived !== undefined
              ? { archivedAt: patch.archived ? new Date().toISOString() : undefined }
              : {}),
          };
          cache.set<ItemPatch>(overrideKey, { ...oldOverride, ...patch });
          for (const [key] of snapshots)
            cache.set(key, (value: unknown) =>
              mapCachedItem(value, id, (item) => ({ ...item, ...changed }))
            );
          try {
            const response = await contentMutationRequest(
              `/api/v1/items/${encodeURIComponent(id)}/state`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
              }
            );
            if (!response.ok) throw new Error("Could not save this change.");
          } catch (error) {
            // Restore this item's changed fields only. Concurrent edits to other
            // items and newly appended pages must survive a failed request.
            for (const [key, snapshot] of snapshots) {
              let original: ItemValue | undefined;
              mapCachedItem(snapshot, id, (item) => {
                original = item;
                return item;
              });
              if (original)
                cache.set(key, (value: unknown) =>
                  mapCachedItem(value, id, (item) => {
                    const restored = { ...item };
                    for (const field of Object.keys(changed)) {
                      if (field in original!) restored[field] = original![field];
                      else delete restored[field];
                    }
                    return restored;
                  })
                );
            }
            cache.set<ItemPatch>(overrideKey, oldOverride ?? {});
            throw error;
          } finally {
            release();
          }
          // Refresh active screens, mark inactive variants stale. Returning to a
          // filtered view then reconciles membership/ranking with the server.
          await Promise.all(families.map((family) => cache.invalidate(family)));
          await cache.invalidate(["item", id, "state"]);
        });
      queue.set(id, operation);
      void operation
        .finally(() => {
          if (queue?.get(id) === operation) queue.delete(id);
        })
        .catch(() => undefined);
      return operation;
    },
    [cache]
  );
  return { updateItem };
}
