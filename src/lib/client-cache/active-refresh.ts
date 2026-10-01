"use client";

import { useEffect } from "react";
import { useContentCache } from "./content-cache";

/** A job list refreshes only while it contains active work; ordinary lists stay idle. */
export function useActiveContentRefresh(
  family: string,
  name: string,
  enabled: boolean,
  refresh: () => Promise<{ error: unknown }>
) {
  const cache = useContentCache();
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let inFlight = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const available = () => document.visibilityState === "visible" && navigator.onLine !== false;
    const schedule = () => {
      if (!alive || !available() || inFlight || timer) return;
      timer = setTimeout(
        async () => {
          timer = undefined;
          if (!alive || !available() || inFlight) return;
          inFlight = true;
          try {
            const result = await refresh();
            failures = result.error ? Math.min(failures + 1, 4) : 0;
          } catch {
            failures = Math.min(failures + 1, 4);
          } finally {
            inFlight = false;
          }
          schedule();
        },
        Math.min(3000 * 2 ** failures, 30_000)
      );
    };
    const availabilityChanged = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (!available() && inFlight) void cache.cancel([family, name]);
      else schedule();
    };
    document.addEventListener("visibilitychange", availabilityChanged);
    window.addEventListener("online", availabilityChanged);
    window.addEventListener("offline", availabilityChanged);
    schedule();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      if (inFlight) void cache.cancel([family, name]);
      document.removeEventListener("visibilitychange", availabilityChanged);
      window.removeEventListener("online", availabilityChanged);
      window.removeEventListener("offline", availabilityChanged);
    };
  }, [cache, enabled, family, name, refresh]);
}
