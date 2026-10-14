/**
 * The Feed's remembered reading mode: the last area chosen in the pill row,
 * kept per browser in localStorage. The URL stays the single source of truth;
 * this only decides which area the Feed navigates to when it is opened with
 * no `area` in the URL. Choosing All forgets the choice. Feed only: Today and
 * Archive never read it.
 *
 * Client-safe: no server-only imports; every storage access is guarded.
 */

import { LIFE_AREAS, type LifeArea } from "@/lib/types";

export const FEED_AREA_STORAGE_KEY = "distil.feed.area";

/** The remembered area, or `undefined` when none is stored or storage is unavailable. */
export function readRememberedArea(): LifeArea | undefined {
  try {
    const value = localStorage.getItem(FEED_AREA_STORAGE_KEY);
    return value && (LIFE_AREAS as readonly string[]).includes(value)
      ? (value as LifeArea)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Stores the chosen area; `undefined` (All) forgets it. */
export function rememberArea(area: LifeArea | undefined): void {
  try {
    if (area) localStorage.setItem(FEED_AREA_STORAGE_KEY, area);
    else localStorage.removeItem(FEED_AREA_STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode, quota, disabled): the URL still works.
  }
}
