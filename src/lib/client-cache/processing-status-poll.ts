"use client";

import { useEffect, useRef } from "react";
import { contentMutationRequest } from "@/lib/client-cache/mutation-request";
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
    let stopped = false;
    let inFlight = false;
    let resumeWhenIdle = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    const schedule = (delay: number) => {
      if (cancelled || stopped || timer || inFlight || !canPoll()) return;
      timer = setTimeout(() => {
        timer = undefined;
        void poll();
      }, delay);
    };

    const poll = async () => {
      if (cancelled || stopped || inFlight || !canPoll()) return;
      inFlight = true;
      const activeController = new AbortController();
      controller = activeController;
      let nextDelay: number | undefined;
      try {
        const response = await contentMutationRequest(
          `/api/v1/items/status?ids=${encodeURIComponent(idsKey)}`,
          { signal: activeController.signal }
        );
        if (!response.ok) throw new Error("Unable to refresh item status");
        const payload = (await response.json()) as { items?: ProcessingItemStatus[] };
        if (cancelled || activeController.signal.aborted || !canPoll()) return;
        const statuses = payload.items ?? [];
        onStatusesRef.current(statuses);
        failures = 0;
        const returned = new Set(statuses.map((item) => item.id));
        const terminal =
          [...expected].every((id) => returned.has(id)) &&
          statuses.every((item) => item.processingStatus !== "processing");
        if (terminal) {
          stopped = true;
          onTerminalRef.current();
          return;
        }
        nextDelay = PROCESSING_POLL_INTERVAL_MS;
      } catch (error) {
        if (
          cancelled ||
          activeController.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        failures += 1;
        nextDelay = Math.min(PROCESSING_POLL_INTERVAL_MS * 2 ** failures, MAX_POLL_BACKOFF_MS);
      } finally {
        if (controller === activeController) controller = undefined;
        inFlight = false;
        const delay = resumeWhenIdle ? 0 : nextDelay;
        resumeWhenIdle = false;
        if (delay !== undefined && !stopped && canPoll()) schedule(delay);
      }
    };

    const pause = () => {
      resumeWhenIdle = false;
      if (timer) clearTimeout(timer);
      timer = undefined;
      controller?.abort();
    };

    const resume = () => {
      if (cancelled || stopped || !canPoll()) return;
      if (inFlight) {
        resumeWhenIdle = true;
        return;
      }
      if (timer) clearTimeout(timer);
      timer = undefined;
      schedule(0);
    };

    const handleVisibility = () => {
      if (canPoll()) resume();
      else pause();
    };

    window.addEventListener("online", resume);
    window.addEventListener("offline", pause);
    document.addEventListener("visibilitychange", handleVisibility);
    schedule(PROCESSING_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      pause();
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", pause);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [idsKey]);
}
