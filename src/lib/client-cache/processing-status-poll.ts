"use client";

import { useEffect, useRef } from "react";
import type { ContentItemSummary } from "@/lib/types";

export interface ProcessingItemStatus {
  id: string;
  processingStatus: NonNullable<ContentItemSummary["processingStatus"]>;
}

export const PROCESSING_POLL_INTERVAL_MS = 3_000;
const MAX_POLL_BACKOFF_MS = 30_000;

function canPoll(): boolean {
  return document.visibilityState === "visible" && navigator.onLine;
}

/**
 * Polls one bounded status projection while the supplied ids are processing.
 * Recursive timeouts prevent overlap; failures back off, and hidden/offline
 * tabs wait without issuing requests. Changing ids or unmounting aborts the
 * current request.
 */
export function useProcessingStatusPoll(
  ids: string[],
  onStatuses: (statuses: ProcessingItemStatus[]) => void,
  onTerminal: () => void
) {
  const idsKey = ids.slice(0, 50).join(",");
  const onStatusesRef = useRef(onStatuses);
  const onTerminalRef = useRef(onTerminal);

  useEffect(() => {
    onStatusesRef.current = onStatuses;
    onTerminalRef.current = onTerminal;
  });

  useEffect(() => {
    if (!idsKey) return;
    const expected = new Set(idsKey.split(","));
    let cancelled = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    const schedule = (delay: number) => {
      if (cancelled || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void poll();
      }, delay);
    };

    const poll = async () => {
      if (cancelled) return;
      if (!canPoll()) {
        schedule(PROCESSING_POLL_INTERVAL_MS);
        return;
      }
      controller = new AbortController();
      try {
        const response = await fetch(`/api/v1/items/status?ids=${encodeURIComponent(idsKey)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unable to refresh item status");
        const payload = (await response.json()) as { items?: ProcessingItemStatus[] };
        if (cancelled) return;
        const statuses = payload.items ?? [];
        onStatusesRef.current(statuses);
        failures = 0;
        const returned = new Set(statuses.map((item) => item.id));
        const terminal =
          [...expected].every((id) => returned.has(id)) &&
          statuses.every((item) => item.processingStatus !== "processing");
        if (terminal) {
          onTerminalRef.current();
          return;
        }
        schedule(PROCESSING_POLL_INTERVAL_MS);
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        failures += 1;
        schedule(Math.min(PROCESSING_POLL_INTERVAL_MS * 2 ** failures, MAX_POLL_BACKOFF_MS));
      } finally {
        controller = undefined;
      }
    };

    const resume = () => {
      if (!canPoll()) return;
      if (timer) clearTimeout(timer);
      timer = undefined;
      schedule(0);
    };

    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    schedule(PROCESSING_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [idsKey]);
}
