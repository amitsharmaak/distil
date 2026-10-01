const summaryEl = document.getElementById("connection-summary");
const signInButton = document.getElementById("sign-in");
const disconnectButton = document.getElementById("disconnect");
const disconnectHint = document.getElementById("disconnect-hint");
const pausedSection = document.getElementById("paused");
const pausedText = document.getElementById("paused-text");
const discardButton = document.getElementById("discard-paused");
const originInput = document.getElementById("origin");
const advanced = document.getElementById("advanced");
const statusEl = document.getElementById("status");

const DEFAULT_ORIGIN = "https://distilai.app";
const BUNDLED_ORIGINS = ["https://distilai.app", "http://localhost:3000"];

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

function say(message, isError = false) {
  statusEl.className = isError ? "status error" : "status";
  statusEl.textContent = message;
}

async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: "distil-get-state" });
  originInput.value = state.origin || originInput.value || DEFAULT_ORIGIN;
  if (state.origin && state.origin !== DEFAULT_ORIGIN) advanced.open = true;

  if (state.configured && !state.legacyToken) {
    summaryEl.textContent = `Signed in${state.accountEmail ? ` as ${state.accountEmail}` : ""}${
      state.label ? ` (${state.label})` : ""
    }.`;
    signInButton.hidden = true;
    disconnectButton.hidden = false;
    disconnectHint.hidden = false;
  } else if (state.configured) {
    summaryEl.textContent =
      "Connected with a pasted capture token (older setup). Sign in to replace it.";
    signInButton.textContent = "Sign in to Distil";
    signInButton.hidden = false;
    disconnectButton.hidden = false;
    disconnectHint.hidden = true;
  } else if (state.signedOut) {
    summaryEl.textContent = "Distil signed this browser out. Sign in again to keep saving.";
    signInButton.textContent = "Sign in again";
    signInButton.hidden = false;
    disconnectButton.hidden = true;
    disconnectHint.hidden = true;
  } else {
    summaryEl.textContent = "Not connected.";
    signInButton.textContent = "Sign in to Distil";
    signInButton.hidden = false;
    disconnectButton.hidden = true;
    disconnectHint.hidden = true;
  }

  pausedSection.hidden = !(state.pausedQueues > 0);
  pausedText.textContent = `${state.pausedQueues} pending capture list${
    state.pausedQueues === 1 ? " belongs" : "s belong"
  } to a different account and stays paused until you sign in to that account again.`;
}

signInButton.addEventListener("click", async () => {
  say("");
  try {
    const origin = normalizeOrigin(originInput.value.trim() || DEFAULT_ORIGIN);
    // Bundled origins already have host access; custom ones need an explicit grant, which must
    // be requested here, inside the click.
    if (!BUNDLED_ORIGINS.includes(origin)) {
      const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
      if (!granted) throw new Error("Origin access was not granted.");
    }
    const result = await chrome.runtime.sendMessage({ type: "distil-start-connect", origin });
    if (!result?.ok) throw new Error(result?.message || "Could not open the sign-in page.");
    say("Finish signing in on the Distil tab that just opened.");
  } catch (error) {
    say(error instanceof Error ? error.message : "Could not start sign-in.", true);
  }
});

disconnectButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "distil-disconnect" });
  say("Disconnected.");
  await refresh();
});

discardButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "distil-discard-paused" });
  await refresh();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.distilConfig) void refresh();
});

void refresh();
