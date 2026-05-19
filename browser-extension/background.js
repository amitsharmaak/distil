/**
 * Distil Browser Extension — Background Service Worker
 *
 * Handles the right-click context menu "Save to Distil" option.
 * When triggered, it sends the page/link URL to the Distil API.
 *
 * API target: POST http://localhost:3000/api/items
 * The API must be running (npm run dev) for saves to reach the database.
 *
 * Fallback: if the API is unreachable (e.g. Distil server is not running),
 * the item is saved to chrome.storage.local so nothing is lost. Items
 * saved locally while offline can be synced in a future phase.
 */

// ── Configuration ──────────────────────────────────────────────────────────────

/**
 * The base URL of the running Distil web app.
 * Change this when deploying Distil to a public URL so the extension can reach it.
 * Example: "https://distil.yourdomain.com"
 */
const DISTIL_API_URL = "http://localhost:3000/api/items";

// ── Keyboard shortcut handler ──────────────────────────────────────────────────

chrome.commands.onCommand.addListener((command) => {
  if (command !== "save-to-distil") return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.url) return;

    saveToAPI({
      url: tab.url,
      title: tab.title || "",
      topics: [],
      sourceType: "browser-extension",
      contentType: "article",
      priority: "medium",
    }).catch(() => saveToLocalStorage({ url: tab.url, title: tab.title || "" }));
  });
});

// ── Context menu setup ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  // Register the right-click menu item available on pages, selected text, and links.
  chrome.contextMenus.create({
    id: "save-to-distil",
    title: "Save to Distil",
    contexts: ["page", "selection", "link"],
  });
});

// ── Context menu click handler ─────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "save-to-distil") return;

  // Prefer the right-clicked link URL; fall back to the full page URL.
  const url = info.linkUrl || info.pageUrl;
  const title = tab?.title || "";
  const selectedText = info.selectionText || "";

  // Attempt to save to the Distil API first. Fall back to local storage if it fails.
  saveToAPI({ url, title, selectedText, sourceType: "browser-extension", contentType: "article", priority: "medium", topics: [] }).catch(() => {
    saveToLocalStorage({ url, title, selectedText });
  });
});

// ── Popup-driven async save ────────────────────────────────────────────────────

/**
 * The popup forwards saves here and then closes immediately. Because the
 * service worker outlives the popup, the fetch keeps running in the background
 * and the API itself returns 202 quickly — so the user never waits on ingestion.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "distil-save") return false;

  saveToAPI(message.payload)
    .catch(() => saveToLocalStorage(message.payload));

  // Ack synchronously so the popup can close right away.
  sendResponse({ ok: true });
  return false;
});

// ── API save ───────────────────────────────────────────────────────────────────

/**
 * Sends a saved item to the Distil API.
 *
 * Maps the extension's minimal data model to the full ContentItem shape:
 * - url       → required
 * - title     → used as the title (OG fetch will enrich it server-side)
 * - notes     → selected text from the page, used as the item's summary
 * - sourceType → always "browser-extension"
 * - contentType → defaults to "article" (the most common web content type)
 * - priority  → defaults to "medium"
 *
 * @throws if the network request fails (caller handles the fallback)
 */
async function saveToAPI(payload) {
  const { url, title, selectedText, notes, sourceType, contentType, priority, topics } = payload;
  const response = await fetch(DISTIL_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      title: title || undefined,
      sourceType: sourceType || "browser-extension",
      contentType: contentType || "article",
      notes: notes || selectedText || undefined,
      priority: priority || "medium",
      topics: topics || [],
    }),
  });

  // 202 is accepted-async; treat it as success.
  if (!response.ok && response.status !== 202) {
    throw new Error(`Distil API returned ${response.status}`);
  }
}

// ── Local storage fallback ─────────────────────────────────────────────────────

/**
 * Saves an item to chrome.storage.local as a fallback when the API is down.
 * Items are stored under the "distilItems" key as an array (newest first).
 *
 * These locally-stored items are not yet synced to the database automatically.
 * A future sync mechanism can pick them up and POST them when the API is back.
 */
function saveToLocalStorage({ url, title, selectedText, notes, topics }) {
  const item = {
    url,
    title,
    selectedText,
    notes,
    savedAt: new Date().toISOString(),
    topics: topics || [],
    pendingSync: true,
  };

  chrome.storage.local.get({ distilItems: [] }, (result) => {
    const items = result.distilItems;
    items.unshift(item);
    chrome.storage.local.set({ distilItems: items });
  });
}
