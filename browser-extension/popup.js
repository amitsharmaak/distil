document.addEventListener("DOMContentLoaded", () => {
  const titleEl = document.getElementById("page-title");
  const urlEl = document.getElementById("page-url");
  const topicsInput = document.getElementById("topics");
  const notesInput = document.getElementById("notes");
  const saveBtn = document.getElementById("save-btn");
  const statusEl = document.getElementById("status");
  const recentEl = document.getElementById("recent");
  const recentListEl = document.getElementById("recent-list");

  // Get current tab info
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab) {
      titleEl.textContent = tab.title || "Untitled";
      urlEl.textContent = tab.url || "";
    }
  });

  // Load recent saves
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

  // Save handler
  saveBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      const item = {
        url: tab.url,
        title: tab.title || "",
        topics: topicsInput.value
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        notes: notesInput.value.trim(),
        savedAt: new Date().toISOString(),
      };

      chrome.storage.local.get({ piaItems: [] }, (result) => {
        const items = result.piaItems;
        items.unshift(item);
        chrome.storage.local.set({ piaItems: items }, () => {
          statusEl.textContent = "Saved to PIA!";
          statusEl.className = "status success";
          statusEl.classList.remove("hidden");
          saveBtn.textContent = "Saved!";
          saveBtn.disabled = true;

          setTimeout(() => window.close(), 1200);
        });
      });
    });
  });
});
