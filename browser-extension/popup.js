document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("status");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.url) {
      window.close();
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: "distil-save",
        payload: {
          url: tab.url,
          title: tab.title || "",
          topics: [],
          notes: "",
          sourceType: "browser-extension",
          contentType: "article",
          priority: "medium",
        },
      },
      () => {
        statusEl.textContent = "Saved!";
        statusEl.className = "status success";
        setTimeout(() => window.close(), 800);
      },
    );
  });
});
