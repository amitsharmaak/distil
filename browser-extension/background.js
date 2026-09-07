/** Distil Browser Extension — durable capture service worker. */

const STORAGE = Object.freeze({
  config: "distilConfig",
  queues: "distilCaptureQueues",
  state: "distilExtensionState",
});
const ALARM_NAME = "distil-replay-captures";
const ALARM_PERIOD_MINUTES = 5;
const CAPTURE_PATH = "/api/v1/captures";
const SUCCESS_STATUSES = new Set([200, 202]);
const AUTH_STATUSES = new Set([401, 403]);
const TERMINAL_STATUSES = new Set([400, 422]);
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
]);

let queueOperation = Promise.resolve();
let replayPromise = null;

function storageGet(defaults) {
  return chrome.storage.local.get(defaults);
}

function storageSet(values) {
  return chrome.storage.local.set(values);
}

function normalizeCaptureUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS pages can be saved.");
  }
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const entries = [...parsed.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.has(key.toLowerCase()))
    .sort(([left], [right]) => left.localeCompare(right));
  parsed.search = "";
  for (const [key, value] of entries) parsed.searchParams.set(key, value);
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
}

function normalizeOrigin(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("The Distil origin must use HTTP or HTTPS.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("The Distil origin cannot contain credentials, a query, or a fragment.");
  }
  if (parsed.pathname !== "/") {
    throw new Error("Enter the Distil origin without a path.");
  }
  const developmentHost =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "[::1]";
  if (parsed.protocol !== "https:" && !developmentHost) {
    throw new Error("The Distil origin must use HTTPS outside local development.");
  }
  return parsed.origin;
}

function permissionPattern(origin) {
  return `${normalizeOrigin(origin)}/*`;
}

function publicState(kind, message, extra = {}) {
  return { kind, message, updatedAt: new Date().toISOString(), ...extra };
}

async function setState(kind, message, extra) {
  const state = publicState(kind, message, extra);
  await storageSet({ [STORAGE.state]: state });
  return state;
}

function serializedQueueOperation(operation) {
  const next = queueOperation.then(operation, operation);
  queueOperation = next.catch(() => undefined);
  return next;
}

async function enqueueCapture(payload) {
  return serializedQueueOperation(async () => {
    const config = await getConfiguration();
    if (!config) throw new Error("Configure a Distil origin and capture token before saving.");
    const normalizedUrl = normalizeCaptureUrl(payload.url);
    const queues = await getQueues();
    const queue = queues[config.accountKey] || [];
    const existing = queue.find((entry) => entry.normalizedUrl === normalizedUrl);

    if (existing) {
      existing.title = payload.title || existing.title;
      existing.notes = payload.notes || payload.selectedText || existing.notes;
      existing.topics = Array.isArray(payload.topics) ? payload.topics : existing.topics;
      queues[config.accountKey] = queue;
      await storageSet({ [STORAGE.queues]: queues });
      return existing;
    }

    const entry = {
      id: crypto.randomUUID(),
      normalizedUrl,
      title: payload.title || "",
      notes: payload.notes || payload.selectedText || "",
      topics: Array.isArray(payload.topics) ? payload.topics : [],
      priority: ["high", "medium", "low"].includes(payload.priority) ? payload.priority : "medium",
      savedAt: new Date().toISOString(),
      attempts: 0,
    };
    queue.push(entry);
    queues[config.accountKey] = queue;
    await storageSet({ [STORAGE.queues]: queues });
    return entry;
  });
}

async function removeQueueEntry(id, accountKey) {
  return serializedQueueOperation(async () => {
    const queues = await getQueues();
    const queue = (queues[accountKey] || []).filter((entry) => entry.id !== id);
    queues[accountKey] = queue;
    await storageSet({ [STORAGE.queues]: queues });
    return queue;
  });
}

async function recordAttempt(id, accountKey) {
  return serializedQueueOperation(async () => {
    const queues = await getQueues();
    const queue = queues[accountKey] || [];
    const entry = queue.find((candidate) => candidate.id === id);
    if (entry) entry.attempts = (entry.attempts || 0) + 1;
    queues[accountKey] = queue;
    await storageSet({ [STORAGE.queues]: queues });
  });
}

async function getQueues() {
  const stored = await storageGet({ [STORAGE.queues]: {} });
  return stored[STORAGE.queues] || {};
}

async function getConfiguration() {
  const stored = await storageGet({ [STORAGE.config]: null });
  const config = stored[STORAGE.config];
  if (!config?.origin || !config?.token || !config?.accountKey) return null;
  return {
    origin: normalizeOrigin(config.origin),
    token: config.token,
    accountKey: config.accountKey,
    authPaused: Boolean(config.authPaused),
  };
}

async function hasOriginPermission(origin) {
  return chrome.permissions.contains({ origins: [permissionPattern(origin)] });
}

async function pauseForAuthentication(config) {
  await storageSet({ [STORAGE.config]: { ...config, authPaused: true } });
}

async function deliverCapture(entry, config) {
  await recordAttempt(entry.id, config.accountKey);
  try {
    const response = await fetch(`${config.origin}${CAPTURE_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: entry.normalizedUrl,
        title: entry.title || undefined,
        notes: entry.notes || undefined,
        topics: entry.topics,
        priority: entry.priority,
        source: "browser-extension",
      }),
    });

    if (SUCCESS_STATUSES.has(response.status)) return { kind: "saved" };
    if (AUTH_STATUSES.has(response.status)) return { kind: "auth", status: response.status };
    if (TERMINAL_STATUSES.has(response.status))
      return { kind: "terminal", status: response.status };
    return { kind: "retry", status: response.status };
  } catch {
    return { kind: "retry", status: 0 };
  }
}

async function replayQueue() {
  if (replayPromise) return replayPromise;

  replayPromise = (async () => {
    const config = await getConfiguration();
    if (!config) {
      return setState("unconfigured", "Configure your Distil origin and capture token.", {
        queued: 0,
      });
    }
    const queues = await getQueues();
    const queued = queues[config.accountKey] || [];
    if (queued.length === 0) return setState("idle", "Ready to save.", { queued: 0 });
    if (!(await hasOriginPermission(config.origin))) {
      return setState("permission-required", "Allow access to your Distil origin in Settings.", {
        queued: queued.length,
      });
    }
    if (config.authPaused) {
      return setState("auth-required", "Your capture token was rejected. Update it in Settings.", {
        queued: queued.length,
      });
    }

    let saved = 0;
    let rejected = 0;
    let retrying = 0;
    let retryStatus = 0;
    for (const entry of queued) {
      const outcome = await deliverCapture(entry, config);
      if (outcome.kind === "saved") {
        await removeQueueEntry(entry.id, config.accountKey);
        saved += 1;
        continue;
      }
      if (outcome.kind === "terminal") {
        await removeQueueEntry(entry.id, config.accountKey);
        rejected += 1;
        await setState("rejected", "Distil rejected this page.", {
          queued: Math.max(queued.length - saved - rejected, 0),
          status: outcome.status,
        });
        continue;
      }
      if (outcome.kind === "auth") {
        await pauseForAuthentication(config);
        return setState(
          "auth-required",
          "Your capture token was rejected. Update it in Settings.",
          {
            queued: queued.length - saved - rejected,
            status: outcome.status,
          }
        );
      }
      retrying += 1;
      retryStatus = outcome.status;
    }

    if (retrying > 0) {
      return setState("queued", "Saved offline. Distil will retry automatically.", {
        queued: retrying,
        status: retryStatus,
      });
    }

    if (rejected > 0 && saved === 0) return getState();
    return setState("saved", saved === 1 ? "Saved to Distil." : `Saved ${saved} pages to Distil.`, {
      queued: 0,
    });
  })().finally(() => {
    replayPromise = null;
  });

  return replayPromise;
}

async function saveCapture(payload) {
  try {
    // Do not enqueue behind a replay snapshot that has already been read. Waiting
    // here ensures every newly persisted entry is included in the next drain.
    if (replayPromise) await replayPromise;
    await enqueueCapture(payload);
    return await replayQueue();
  } catch (error) {
    return setState(
      "unsupported",
      error instanceof Error ? error.message : "This page cannot be saved."
    );
  }
}

async function getState() {
  const stored = await storageGet({
    [STORAGE.queues]: {},
    [STORAGE.config]: null,
    [STORAGE.state]: publicState("idle", "Ready to save."),
  });
  const accountKey = stored[STORAGE.config]?.accountKey;
  const queue = accountKey ? stored[STORAGE.queues][accountKey] || [] : [];
  const pausedQueues = Object.entries(stored[STORAGE.queues]).filter(
    ([key, entries]) => key !== accountKey && Array.isArray(entries) && entries.length > 0
  ).length;
  return {
    ...stored[STORAGE.state],
    configured: Boolean(stored[STORAGE.config]?.origin && stored[STORAGE.config]?.token),
    queued: queue.length,
    pausedQueues,
  };
}

function handleMessage(message) {
  switch (message?.type) {
    case "distil-save":
      return saveCapture(message.payload || {});
    case "distil-replay":
      return replayQueue();
    case "distil-get-state":
      return getState();
    case "distil-config-updated":
      if (message.discardAccountKey) {
        return serializedQueueOperation(async () => {
          const queues = await getQueues();
          delete queues[message.discardAccountKey];
          await storageSet({ [STORAGE.queues]: queues });
          return replayQueue();
        });
      }
      return replayQueue();
    default:
      return null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const response = handleMessage(message);
  if (!response) return false;
  response.then(sendResponse, () =>
    sendResponse(publicState("error", "The extension could not finish that action."))
  );
  return true;
});

function captureFromTab(tab, extra = {}) {
  if (!tab?.url) return;
  void saveCapture({ url: tab.url, title: tab.title || "", ...extra });
}

chrome.commands.onCommand.addListener((command) => {
  if (command !== "save-to-distil") return;
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => captureFromTab(tab));
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "save-to-distil") return;
  captureFromTab(tab, {
    ...(info.linkUrl || info.pageUrl ? { url: info.linkUrl || info.pageUrl } : {}),
    notes: info.selectionText || "",
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "save-to-distil",
      title: "Save to Distil",
      contexts: ["page", "selection", "link"],
    });
  });
  void ensureReplayAlarm();
  void replayQueue();
});

chrome.runtime.onStartup.addListener(() => void replayQueue());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) void replayQueue();
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STORAGE.config]) void replayQueue();
});

async function ensureReplayAlarm() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) await chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
}

void ensureReplayAlarm();
void replayQueue();
