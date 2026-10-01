"use client";

import { useEffect } from "react";
import { useContentCache } from "./content-cache";

/** List positions share the account cache's lifetime and eviction bounds. */
export function useViewScroll(view: string, ready: boolean) {
  const cache = useContentCache();
  useEffect(() => {
    if (!ready || window.location.hash) return;
    const key = ["view-scroll", view];
    let position = cache.get<number>(key) ?? 0;
    const restore = requestAnimationFrame(() =>
      window.scrollTo({ top: position, behavior: "instant" })
    );
    const remember = () => {
      position = window.scrollY;
    };
    window.addEventListener("scroll", remember, { passive: true });
    return () => {
      cancelAnimationFrame(restore);
      window.removeEventListener("scroll", remember);
      cache.set(key, position);
    };
  }, [cache, ready, view]);
}
