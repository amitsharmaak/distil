"use client";

export const CONTENT_AUTH_EVENT = "distil:account-changed";
export const CONTENT_AUTH_STORAGE_KEY = "distil.account-change";

/** Broadcast a nonce only; neither identities nor content leave this tab. */
export function announceAccountChange(): void {
  window.dispatchEvent(new Event(CONTENT_AUTH_EVENT));
  try {
    window.localStorage.setItem(CONTENT_AUTH_STORAGE_KEY, crypto.randomUUID());
  } catch {
    // Private browsing may deny storage; this tab is still cleared.
  }
}
