"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

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

function subscribeToTheme(onStoreChange: () => void): () => void {
  function syncStoredTheme() {
    document.documentElement.classList.toggle(
      "dark",
      localStorage.getItem(THEME_STORAGE_KEY) === "dark"
    );
    onStoreChange();
  }

  window.addEventListener("storage", syncStoredTheme);
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", syncStoredTheme);
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
  };
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    localStorage.setItem(THEME_STORAGE_KEY, next);
    document.documentElement.classList.toggle("dark", next === "dark");
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}
