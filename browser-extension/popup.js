/**
 * PIA Browser Extension — Popup Script
 *
 * Handles the Save button in the extension popup.
 * Sends the current tab's URL to the PIA API and shows feedback to the user.
 *
 * API target: POST http://localhost:3000/api/items
 *
 * Fallback: if the API is unreachable, the item is saved to chrome.storage.local
 * so nothing is lost. The popup shows a different status message so the user
 * knows the save was local-only.
 */

// ── Configuration ──────────────────────────────────────────────────────────────

/**
 * The PIA API endpoint to POST new items to.
 * Must match the running PIA web app. Change this for production deployments.
 */
const PIA_API_URL = "http://localhost:3000/api/items";

// ── Initialization ─────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // Grab all DOM elements we'll interact with.
  const titleEl = document.getElementById("page-title");
  const urlEl = document.getElementById("page-url");
  const topicsInput = document.getElementById("topics");
  const notesInput = document.getElementById("notes");
  const saveBtn = document.getElementById("save-btn");
  const statusEl = document.getElementById("status");
  const recentEl = document.getElementById("recent");
  const recentListEl = document.getElementById("recent-list");

  // ── Display current tab info ─────────────────────────────────────────────────

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab) {
      titleEl.textContent = tab.title || "Untitled";
      urlEl.textContent = tab.url || "";
    }
  });

  // ── Load recent saves ────────────────────────────────────────────────────────

  // Show the last 3 locally-stored items in the popup so the user can see
  // what they recently saved. In a future phase this will load from the API.
  chrome.storage.local.get({ piaItems: [] }, (result) => {
    const items = result.piaItems;
    if (items.length > 0) {
      recentEl.classList.remove("hidden");
      items.slice(0, 3).forEach((item) => {
        const div = document.createElement("div");
        div.className = "recent-item";
        div.textContent = item.title || item.url;
        recentListEl.appendChild(div);
      });
    }
  });

  // ── Save button handler ──────────────────────────────────────────────────────

  saveBtn.addEventListener("click", async () => {
    // Disable the button immediately to prevent double-saves.
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab?.url) return;

      // Parse topics from the comma-separated input field.
      const topics = topicsInput.value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const notes = notesInput.value.trim();

      // Try the API first; fall back to local storage if it fails.
      const saved = await saveToAPI({
        url: tab.url,
        title: tab.title || "",
        topics,
        notes,
      });

      if (saved) {
        // Success — show confirmation and close the popup.
        showStatus("Saved to PIA!", "success");
      } else {
        // API unreachable — saved locally instead.
        saveToLocalStorage({ url: tab.url, title: tab.title || "", topics, notes });
        showStatus("Saved locally (PIA offline)", "warning");
      }

      saveBtn.textContent = "Saved!";
      // Auto-close the popup after a short delay.
      setTimeout(() => window.close(), 1200);
    });
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** Shows a status message in the popup. */
  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    statusEl.classList.remove("hidden");
  }
});

// ── API save ───────────────────────────────────────────────────────────────────

/**
 * Sends the item to the PIA API.
 *
 * @returns true on success, false if the API is unreachable or returns an error.
 */
async function saveToAPI({ url, title, topics, notes }) {
  try {
    const response = await fetch(PIA_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        // Provide the tab title as a hint; OG fetch will confirm/replace it server-side.
        title: title || undefined,
        sourceType: "browser-extension",
        contentType: "article",
        topics,
        // Notes become the item's summary in PIA.
        notes: notes || undefined,
        priority: "medium",
      }),
    });
    return response.ok;
  } catch {
    // Network error (e.g. PIA server not running).
    return false;
  }
}

// ── Local storage fallback ─────────────────────────────────────────────────────

/**
 * Saves an item to chrome.storage.local as a fallback when the API is offline.
 * Items are flagged with pendingSync: true so a future sync pass can upload them.
 */
function saveToLocalStorage({ url, title, topics, notes }) {
  const item = {
    url,
    title,
    topics,
    notes,
    savedAt: new Date().toISOString(),
    // Flag for future sync pass when PIA comes back online.
    pendingSync: true,
  };

  chrome.storage.local.get({ piaItems: [] }, (result) => {
    const items = result.piaItems;
    items.unshift(item);
    chrome.storage.local.set({ piaItems: items });
  });
}
