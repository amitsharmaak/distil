const statusEl = document.getElementById("status");
const settingsButton = document.getElementById("settings");

const STATE_LABELS = {
  saved: "Saved to Distil",
  queued: "Saved offline — retrying",
  "auth-required": "Signed out of Distil",
  unconfigured: "Sign in to Distil to save",
  "permission-required": "Origin access is required",
  rejected: "Distil rejected this page",
  unsupported: "This page cannot be saved",
  error: "Save failed",
};

let currentKind = "idle";

function showState(state) {
  currentKind = state.kind || "idle";
  statusEl.textContent = STATE_LABELS[state.kind] || state.message || "Ready to save";
  statusEl.className = `status ${state.kind || "idle"}`;
  settingsButton.hidden = ![
    "auth-required",
    "unconfigured",
    "permission-required",
    "error",
  ].includes(state.kind);
  settingsButton.textContent = state.kind === "auth-required" ? "Sign in again" : "Open Settings";
  if (state.kind === "unconfigured") settingsButton.textContent = "Set up Distil";
  if (state.kind === "saved") setTimeout(() => window.close(), 800);
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ kind: "error", message: "The extension service is unavailable." });
        return;
      }
      resolve(response || { kind: "error", message: "The extension did not respond." });
    });
  });
}

settingsButton.addEventListener("click", async () => {
  if (currentKind === "auth-required") {
    const state = await sendMessage({ type: "distil-get-state" });
    const result = await sendMessage({ type: "distil-start-connect", origin: state.origin });
    if (result?.ok) {
      window.close();
      return;
    }
  }
  chrome.runtime.openOptionsPage();
});

document.addEventListener("DOMContentLoaded", async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.url) {
    showState({ kind: "unsupported" });
    return;
  }

  showState(
    await sendMessage({
      type: "distil-save",
      payload: { url: tab.url, title: tab.title || "", topics: [], priority: "medium" },
    })
  );
});
