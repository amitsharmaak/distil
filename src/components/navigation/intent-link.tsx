"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import { CACHE_FRESHNESS, useContentCache } from "@/lib/client-cache/content-cache";
import { config } from "@/lib/config";

const HOVER_INTENT_DELAY_MS = 100;
const INTENT_DEDUP_MS = 30_000;
const MAX_RECENT_INTENTS = 64;
const recentIntents = new Map<string, number>();

type LinkProps = React.ComponentProps<typeof Link>;

export type IntentLinkProps = Omit<LinkProps, "href" | "prefetch"> & {
  href: string;
  /** Optional data-cache warming performed alongside the route prefetch. */
  onIntent?: () => void | Promise<void>;
};

function canPrefetch(): boolean {
  if (document.visibilityState === "hidden") return false;
  if (navigator.onLine === false) return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData !== true;
}

function claimIntent(href: string): boolean {
  const now = Date.now();
  const previous = recentIntents.get(href);
  if (previous !== undefined && now - previous < INTENT_DEDUP_MS) return false;

  recentIntents.delete(href);
  recentIntents.set(href, now);
  if (recentIntents.size > MAX_RECENT_INTENTS) {
    const oldest = recentIntents.keys().next().value;
    if (oldest !== undefined) recentIntents.delete(oldest);
  }
  return true;
}

/**
 * A canonical Next link which avoids viewport fanout and warms only after user intent.
 * Hover is debounced to ignore cursor transit; keyboard focus and touch start are immediate.
 */
export function IntentLink({
  href,
  onIntent,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onTouchStart,
  ...props
}: IntentLinkProps) {
  const router = useRouter();
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHover = useCallback(() => {
    if (hoverTimer.current !== null) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }, []);

  const prefetch = useCallback(() => {
    cancelHover();
    if (!canPrefetch() || !claimIntent(href)) return;
    router.prefetch(href);
    try {
      const pending = onIntent?.();
      if (pending) void Promise.resolve(pending).catch(() => undefined);
    } catch {
      // Navigation intent should remain usable when optional data warming fails.
    }
  }, [cancelHover, href, onIntent, router]);

  useEffect(() => cancelHover, [cancelHover]);

  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        if (hoverTimer.current === null) {
          hoverTimer.current = setTimeout(prefetch, HOVER_INTENT_DELAY_MS);
        }
      }}
      onMouseLeave={(event) => {
        onMouseLeave?.(event);
        cancelHover();
      }}
      onFocus={(event) => {
        onFocus?.(event);
        prefetch();
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event);
        prefetch();
      }}
    />
  );
}

type ResearchIntentLinkProps = Omit<IntentLinkProps, "onIntent">;

/** Warms the two independent data reads used by the Research landing page. */
export function ResearchListIntentLink(props: ResearchIntentLinkProps) {
  const cache = useContentCache();
  const warm = useCallback(async () => {
    await Promise.all([
      cache.prefetch<unknown>({
        key: ["research", "list"],
        url: `${config.apiBaseUrl}/api/ai/research/list`,
        staleTime: CACHE_FRESHNESS.library,
      }),
      cache.prefetch<unknown>({
        key: ["research", "suggestions"],
        url: `${config.apiBaseUrl}/api/ai/research/suggestions`,
        staleTime: CACHE_FRESHNESS.library,
      }),
    ]);
  }, [cache]);
  return <IntentLink {...props} onIntent={warm} />;
}

/** Warms one report payload after intent; the account cache retains it for 30 minutes. */
export function ResearchReportIntentLink({
  reportId,
  ...props
}: ResearchIntentLinkProps & { reportId: string }) {
  const cache = useContentCache();
  const warm = useCallback(
    () =>
      cache.prefetch<unknown>({
        key: ["research", "report", reportId],
        url: `${config.apiBaseUrl}/api/ai/research/${encodeURIComponent(reportId)}`,
        staleTime: CACHE_FRESHNESS.detail,
      }),
    [cache, reportId]
  );
  return <IntentLink {...props} onIntent={warm} />;
}
