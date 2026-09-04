const form = document.getElementById("configuration");
const originInput = document.getElementById("origin");
const tokenInput = document.getElementById("token");
const tokenHint = document.getElementById("token-hint");
const statusEl = document.getElementById("status");

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
  const { distilConfig } = await chrome.storage.local.get({ distilConfig: null });
  originInput.value = distilConfig?.origin || "http://localhost:3000";
  if (distilConfig?.token) {
    tokenInput.required = false;
    tokenInput.placeholder = "Saved — leave blank to keep it";
    tokenHint.textContent = "A token is saved. Enter a new one only to replace it.";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusEl.className = "status";
  statusEl.textContent = "";
  try {
    const origin = normalizeOrigin(originInput.value.trim());
    const { distilConfig } = await chrome.storage.local.get({ distilConfig: null });
    const token = tokenInput.value.trim() || distilConfig?.token;
    if (!token) throw new Error("Enter a capture token.");
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) throw new Error("Origin access was not granted.");

    if (distilConfig?.origin && distilConfig.origin !== origin && chrome.permissions.remove) {
      await chrome.permissions.remove({ origins: [`${normalizeOrigin(distilConfig.origin)}/*`] });
    }

    await chrome.storage.local.set({ distilConfig: { origin, token, authPaused: false } });
    tokenInput.value = "";
    tokenInput.required = false;
    tokenInput.placeholder = "Saved — leave blank to keep it";
    tokenHint.textContent = "A token is saved. Enter a new one only to replace it.";
    statusEl.textContent = "Connection saved. Pending captures will retry now.";
    await chrome.runtime.sendMessage({ type: "distil-config-updated" });
  } catch (error) {
    statusEl.className = "status error";
    statusEl.textContent =
      error instanceof Error ? error.message : "Could not save the connection.";
  }
});

void loadConfiguration();
