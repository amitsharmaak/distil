"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "distil.shortcuts.singleKey";
const CHANGE_EVENT = "distil-shortcuts-preference-change";

/** Single-key shortcuts default to on; only an explicit "off" disables them. */
export function readSingleKeyShortcuts(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSingleKeyShortcuts(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
  } catch {
    // Storage unavailable; still notify same-tab subscribers below.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onStoreChange: () => void): () => void {
  function onStorage(e: StorageEvent) {
    if (e.key === null || e.key === STORAGE_KEY) onStoreChange();
  }
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
  };
}

export function useSingleKeyShortcuts(): boolean {
  return useSyncExternalStore(subscribe, readSingleKeyShortcuts, () => true);
}
