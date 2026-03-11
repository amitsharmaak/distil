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
  saveToAPI({ url, title, selectedText }).catch(() => {
    // API unreachable — persist locally so the link is not lost.
    saveToLocalStorage({ url, title, selectedText });
  });
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
async function saveToAPI({ url, title, selectedText }) {
  const response = await fetch(DISTIL_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      title: title || undefined,
      sourceType: "browser-extension",
      contentType: "article",
      notes: selectedText || undefined,
      priority: "medium",
      topics: [],
    }),
  });

  if (!response.ok) {
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
function saveToLocalStorage({ url, title, selectedText }) {
  const item = {
    url,
    title,
    selectedText,
    savedAt: new Date().toISOString(),
    topics: [],
    pendingSync: true,
  };

  chrome.storage.local.get({ distilItems: [] }, (result) => {
    const items = result.distilItems;
    items.unshift(item);
    chrome.storage.local.set({ distilItems: items });
  });
}
