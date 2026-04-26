/**
 * Distil Browser Extension — Popup Script
 *
 * Handles the Save button in the extension popup.
 * Sends the current tab's URL to the Distil API and shows feedback to the user.
 *
 * API target: POST http://localhost:3000/api/items
 *
 * Fallback: if the API is unreachable, the item is saved to chrome.storage.local
 * so nothing is lost. The popup shows a different status message so the user
 * knows the save was local-only.
 */

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
  chrome.storage.local.get({ distilItems: [] }, (result) => {
    const items = result.distilItems;
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

  saveBtn.addEventListener("click", () => {
    saveBtn.disabled = true;
    saveBtn.textContent = "Saved!";

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.url) {
        window.close();
        return;
      }

      const topics = topicsInput.value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const notes = notesInput.value.trim();

      // Hand off to the service worker. It outlives the popup, so the fetch
      // (and any local-storage fallback) completes after this window closes.
      chrome.runtime.sendMessage({
        type: "distil-save",
        payload: {
          url: tab.url,
          title: tab.title || "",
          topics,
          notes,
          sourceType: "browser-extension",
          contentType: "article",
          priority: "medium",
        },
      });

      showStatus("Saved to Distil!", "success");
      setTimeout(() => window.close(), 250);
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

// All network and fallback work now lives in the background service worker
// (background.js), which keeps running after the popup closes.
