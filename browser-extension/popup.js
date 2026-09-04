const statusEl = document.getElementById("status");
const settingsButton = document.getElementById("settings");

const STATE_LABELS = {
  saved: "Saved to Distil",
  queued: "Saved offline — retrying",
  "auth-required": "Capture token needs attention",
  unconfigured: "Set up Distil to save",
  "permission-required": "Origin access is required",
  rejected: "Distil rejected this page",
  unsupported: "This page cannot be saved",
  error: "Save failed",
};

function showState(state) {
  statusEl.textContent = STATE_LABELS[state.kind] || state.message || "Ready to save";
  statusEl.className = `status ${state.kind || "idle"}`;
  settingsButton.hidden = ![
    "auth-required",
    "unconfigured",
    "permission-required",
    "error",
  ].includes(state.kind);
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

settingsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());

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
