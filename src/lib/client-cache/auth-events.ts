"use client";

export const CONTENT_AUTH_EVENT = "distil:account-changed";
export const CONTENT_AUTH_STORAGE_KEY = "distil.account-change";

export interface AccountChangeDetail {
  /** The caller is about to replace this document; clear the cache but keep the page. */
  leaving: boolean;
}

/**
 * Broadcast a nonce only; neither identities nor content leave this tab.
 *
 * This tab's cache is cleared and its content replaced by the session notice. Pass
 * `leaving: true` when the caller navigates away by a full document load straight afterwards
 * (sign-in, sign-out): the cache is still cleared and other tabs are still told, but this tab
 * keeps its page until the new document arrives instead of flashing the notice.
 */
export function announceAccountChange(options: { leaving?: boolean } = {}): void {
  window.dispatchEvent(
    new CustomEvent<AccountChangeDetail>(CONTENT_AUTH_EVENT, {
      detail: { leaving: options.leaving === true },
    })
  );
  try {
    window.localStorage.setItem(CONTENT_AUTH_STORAGE_KEY, crypto.randomUUID());
  } catch {
    // Private browsing may deny storage; this tab is still cleared.
  }
}
