"use client";

import { createContext, useContext, useLayoutEffect, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => {},
});

const THEME_STORAGE_KEY = "theme";
const THEME_CHANGE_EVENT = "distil-theme-change";

function getThemeSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getServerThemeSnapshot(): Theme {
  return "light";
}

/**
 * Put the stored theme back on `<html>` if it is missing; returns whether anything changed.
 *
 * The class is first set by the inline script in the root layout, before hydration, and React
 * does not manage it. But when React has to re-create the root on the client (it does after a
 * hydration error), it removes every attribute from `<html>` that is not one of its props, and
 * the page would silently fall back to light. The stored preference is the source of truth, so
 * it is re-applied when the provider mounts and whenever the class is changed from outside.
 * Where storage is unavailable the class is left alone.
 */
function restoreStoredTheme(): boolean {
  let dark: boolean;
  try {
    dark = localStorage.getItem(THEME_STORAGE_KEY) === "dark";
  } catch {
    return false;
  }
  const root = document.documentElement;
  if (root.classList.contains("dark") === dark) return false;
  root.classList.toggle("dark", dark);
  return true;
}

function subscribeToTheme(onStoreChange: () => void): () => void {
  function syncStoredTheme(event: StorageEvent) {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    document.documentElement.classList.toggle("dark", event.newValue === "dark");
    onStoreChange();
  }
  const classGuard =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {
          if (restoreStoredTheme()) onStoreChange();
        });
  classGuard?.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  window.addEventListener("storage", syncStoredTheme);
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => {
    classGuard?.disconnect();
    window.removeEventListener("storage", syncStoredTheme);
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
  };
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);

  // Before paint, in the same commit in which React may have reset `<html>`.
  useLayoutEffect(() => {
    if (restoreStoredTheme()) window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  function toggle() {
    const next = getThemeSnapshot() === "light" ? "dark" : "light";
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The theme still works for this visit when the browser blocks storage.
    }
    document.documentElement.classList.toggle("dark", next === "dark");
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}
