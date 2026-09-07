const form = document.getElementById("configuration");
const originInput = document.getElementById("origin");
const tokenInput = document.getElementById("token");
const tokenHint = document.getElementById("token-hint");
const statusEl = document.getElementById("status");
const discardPrevious = document.getElementById("discard-previous");
const discardLabel = document.getElementById("discard-label");
const accountWarning = document.getElementById("account-warning");

async function accountKey(origin, token) {
  const input = new TextEncoder().encode(`${origin}\n${token}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeOrigin(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new Error("Use an HTTP or HTTPS origin.");
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw new Error("Enter an origin without credentials, a path, query, or fragment.");
  }
  const developmentHost =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "[::1]";
  if (parsed.protocol !== "https:" && !developmentHost) {
    throw new Error("Use HTTPS outside local development.");
  }
  return parsed.origin;
}

async function loadConfiguration() {
  const { distilConfig, distilCaptureQueues } = await chrome.storage.local.get({
    distilConfig: null,
    distilCaptureQueues: {},
  });
  originInput.value = distilConfig?.origin || "http://localhost:3000";
  if (distilConfig?.token) {
    tokenInput.required = false;
    tokenInput.placeholder = "Saved — leave blank to keep it";
    tokenHint.textContent = "A token is saved. Enter a new one only to replace it.";
  }
  const activeQueue = distilConfig?.accountKey
    ? distilCaptureQueues[distilConfig.accountKey] || []
    : [];
  if (activeQueue.length > 0) {
    accountWarning.hidden = false;
    accountWarning.textContent = `${activeQueue.length} pending capture${activeQueue.length === 1 ? "" : "s"} belong to this account. Changing the token pauses them until this account is restored or you explicitly discard them.`;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusEl.className = "status";
  statusEl.textContent = "";
  try {
    const origin = normalizeOrigin(originInput.value.trim());
    const { distilConfig, distilCaptureQueues } = await chrome.storage.local.get({
      distilConfig: null,
      distilCaptureQueues: {},
    });
    const suppliedToken = tokenInput.value.trim();
    const token = suppliedToken || distilConfig?.token;
    if (!token) throw new Error("Enter a capture token.");
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) throw new Error("Origin access was not granted.");

    if (distilConfig?.origin && distilConfig.origin !== origin && chrome.permissions.remove) {
      await chrome.permissions.remove({ origins: [`${normalizeOrigin(distilConfig.origin)}/*`] });
    }

    const nextAccountKey = await accountKey(origin, token);
    const previousAccountKey = distilConfig?.accountKey;
    const switchingAccount = Boolean(previousAccountKey && previousAccountKey !== nextAccountKey);
    const previousQueue = previousAccountKey ? distilCaptureQueues[previousAccountKey] || [] : [];
    if (switchingAccount && previousQueue.length > 0) {
      discardLabel.hidden = false;
      accountWarning.hidden = false;
      accountWarning.textContent =
        "This token belongs to a different account. Pending captures remain paused for the original account. Check the box only to discard them.";
    }

    await chrome.storage.local.set({
      distilConfig: { origin, token, accountKey: nextAccountKey, authPaused: false },
    });
    tokenInput.value = "";
    tokenInput.required = false;
    tokenInput.placeholder = "Saved — leave blank to keep it";
    tokenHint.textContent = "A token is saved. Enter a new one only to replace it.";
    statusEl.textContent = switchingAccount
      ? "Connection saved. Captures for the original account remain paused."
      : "Connection saved. Pending captures will retry now.";
    await chrome.runtime.sendMessage({
      type: "distil-config-updated",
      ...(switchingAccount && discardPrevious.checked
        ? { discardAccountKey: previousAccountKey }
        : {}),
    });
  } catch (error) {
    statusEl.className = "status error";
    statusEl.textContent =
      error instanceof Error ? error.message : "Could not save the connection.";
  }
});

void loadConfiguration();
