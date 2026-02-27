chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-pia",
    title: "Save to PIA",
    contexts: ["page", "selection", "link"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-to-pia") {
    const item = {
      url: info.linkUrl || info.pageUrl,
      title: tab.title || "",
      selectedText: info.selectionText || "",
      savedAt: new Date().toISOString(),
      topics: [],
    };

    chrome.storage.local.get({ piaItems: [] }, (result) => {
      const items = result.piaItems;
      items.unshift(item);
      chrome.storage.local.set({ piaItems: items });
    });
  }
});
