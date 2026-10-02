/**
 * Client-safe constants for the Distil Chrome extension. The development id below is public: it is
 * derived from the public `key` pinned in `browser-extension/manifest.json`, so every unpacked or
 * self-packed build shares it. The matching private key never lives in this repository.
 *
 * The Chrome Web Store may refuse a manifest that carries `key` and assigns its own id to the
 * listing. The connect page therefore tries every id in DISTIL_EXTENSION_IDS in order: the
 * development id first, then the store id, so both builds connect without a coordinated release.
 */
export const DISTIL_EXTENSION_ID = "fkodjlobficbnhjidcgeihniinpoiaop";
/** Id the Chrome Web Store assigned to the listing (the store build carries no `key`). */
export const DISTIL_STORE_EXTENSION_ID = "malhlcmmheemmdebmjpgliligpjlnama";
export const DISTIL_EXTENSION_IDS: readonly string[] = [
  DISTIL_EXTENSION_ID,
  DISTIL_STORE_EXTENSION_ID,
];

/** Where users install the extension from. Replaced with the store listing URL once X3 ships. */
export const DISTIL_EXTENSION_INSTALL_URL = `https://chromewebstore.google.com/detail/${DISTIL_EXTENSION_ID}`;

/** Message `type` the connect page sends to the extension through `chrome.runtime.sendMessage`. */
export const EXTENSION_CONNECT_MESSAGE = "distil-connect";

/** Path of the public connect page; the extension opens it with a `state` query parameter. */
export const EXTENSION_CONNECT_PATH = "/extension/connect";

/** The extension's `state` nonce: 32 random bytes as base64url or hex, between 32 and 128 chars. */
export const EXTENSION_STATE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
