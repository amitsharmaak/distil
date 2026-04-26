import "server-only";

import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium, type BrowserContext, type Page } from "playwright";

import { config } from "../../config";
import { connectorLogger } from "../../logger";
import { PublisherAuthRequired, type PublisherDefinition } from "./types";

const INTERACTIVE_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const INTERACTIVE_LOGIN_POLL_MS = 2000;
const STATUS_CACHE_TTL_MS = 5 * 60 * 1000;

// Serialize Chromium launches per-publisher so concurrent status checks /
// fetches don't collide on the persistent profile's SingletonLock.
const launchLocks = new Map<string, Promise<unknown>>();
const statusCache = new Map<
  string,
  { state: "connected" | "expired" | "never"; checkedAt: string; expiresAt: number }
>();

async function withLaunchLock<T>(
  publisherId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = launchLocks.get(publisherId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  launchLocks.set(
    publisherId,
    next.catch(() => undefined),
  );
  return next;
}

async function clearStaleLocks(dir: string): Promise<void> {
  for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    await unlink(path.join(dir, name)).catch(() => undefined);
  }
}

function sessionDirFor(publisher: PublisherDefinition): string {
  return path.join(config.publisherSessionDir, publisher.id);
}

function statusFileFor(publisherId: string): string {
  return path.join(config.publisherSessionDir, publisherId, "status.json");
}

function storageStateFileFor(publisherId: string): string {
  return path.join(
    config.publisherSessionDir,
    publisherId,
    "storage-state.json",
  );
}

type PersistedStatus = {
  state: "connected" | "expired";
  checkedAt: string;
};

type StorageStateCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
};

type StorageStateFile = {
  cookies?: StorageStateCookie[];
  origins?: unknown[];
};

async function readStorageState(
  publisherId: string,
): Promise<StorageStateFile | null> {
  try {
    const raw = await readFile(storageStateFileFor(publisherId), "utf-8");
    const parsed = JSON.parse(raw) as StorageStateFile;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    connectorLogger.warn(
      { err, publisherId },
      "Failed to read publisher storage state; proceeding without injection",
    );
    return null;
  }
}

async function writeStorageState(
  context: BrowserContext,
  publisherId: string,
): Promise<void> {
  try {
    const file = storageStateFileFor(publisherId);
    await mkdir(path.dirname(file), { recursive: true });
    await context.storageState({ path: file });
  } catch (err) {
    connectorLogger.warn(
      { err, publisherId },
      "Failed to write publisher storage state",
    );
  }
}

async function readPersistedStatus(
  publisherId: string,
): Promise<PersistedStatus | null> {
  try {
    const raw = await readFile(statusFileFor(publisherId), "utf-8");
    const parsed = JSON.parse(raw) as PersistedStatus;
    if (parsed.state !== "connected" && parsed.state !== "expired") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writePersistedStatus(
  publisherId: string,
  status: PersistedStatus,
): Promise<void> {
  await mkdir(path.dirname(statusFileFor(publisherId)), { recursive: true });
  await writeFile(statusFileFor(publisherId), JSON.stringify(status), "utf-8");
}

async function clearPersistedStatus(publisherId: string): Promise<void> {
  await unlink(statusFileFor(publisherId)).catch(() => undefined);
}

async function checkProbe(
  page: Page,
  publisher: PublisherDefinition,
  { waitMs = 0 }: { waitMs?: number } = {},
): Promise<boolean> {
  const { expectSelector, expectNotSelector } = publisher.sessionProbe;
  try {
    if (expectSelector) {
      if (waitMs > 0) {
        try {
          await page.waitForSelector(expectSelector, { timeout: waitMs });
        } catch {
          return false;
        }
      } else {
        const found = await page.$(expectSelector);
        if (!found) return false;
      }
    }
    if (expectNotSelector) {
      const blocker = await page.$(expectNotSelector);
      if (blocker) return false;
    }
    return true;
  } catch (err) {
    connectorLogger.warn(
      { err, publisherId: publisher.id },
      "Publisher session probe failed",
    );
    return false;
  }
}

async function validateProbe(
  context: BrowserContext,
  publisher: PublisherDefinition,
): Promise<boolean> {
  const page = await context.newPage();
  try {
    await page.goto(publisher.sessionProbe.url, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    // Wait through any Cloudflare "Just a moment..." challenge (up to ~20s).
    const cfDeadline = Date.now() + 20000;
    while (Date.now() < cfDeadline) {
      const title = await page.title().catch(() => "");
      if (!/just a moment/i.test(title)) break;
      await page.waitForTimeout(1000);
    }
    const ok = await checkProbe(page, publisher, { waitMs: 15000 });
    if (!ok) {
      const finalUrl = page.url();
      const title = await page.title().catch(() => "<unknown>");
      const hasLogin = (await page.$("text=/log\\s*in/i")) !== null;
      connectorLogger.warn(
        {
          publisherId: publisher.id,
          probeUrl: publisher.sessionProbe.url,
          finalUrl,
          title,
          looksLoggedOut: hasLogin,
        },
        "Publisher session probe selector did not match",
      );
    }
    return ok;
  } catch (err) {
    connectorLogger.warn(
      { err, publisherId: publisher.id },
      "Publisher session probe navigation failed",
    );
    return false;
  } finally {
    await page.close();
  }
}

export async function ensureSession(
  publisher: PublisherDefinition,
): Promise<BrowserContext> {
  return withLaunchLock(publisher.id, async () => {
    const dir = sessionDirFor(publisher);
    await mkdir(dir, { recursive: true });
    await clearStaleLocks(dir);

    // Cloudflare aggressively blocks pure headless Chromium with "Just a moment..."
    // challenges. Running in headed mode locally (off-screen) plus disabling
    // AutomationControlled is the most reliable bypass without stealth plugins.
    const context = await chromium.launchPersistentContext(dir, {
      headless: false,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--window-position=10000,10000",
      ],
    });

    // Re-inject session-scoped cookies (e.g. wordpress_logged_in_*) that
    // Chromium discards when the prior context closed.
    const stored = await readStorageState(publisher.id);
    if (stored?.cookies && stored.cookies.length > 0) {
      try {
        await context.addCookies(stored.cookies);
      } catch (err) {
        connectorLogger.warn(
          { err, publisherId: publisher.id },
          "Failed to inject persisted cookies into publisher context",
        );
      }
    }

    const valid = await validateProbe(context, publisher);
    if (!valid) {
      await context.close();
      // Flip status to expired so the UI prompts a reconnect, but keep
      // storage-state.json intact: a stale probe selector can fail without
      // the cookies actually being invalid, and re-login is the only path
      // that legitimately rewrites storage state.
      await clearPersistedStatus(publisher.id);
      statusCache.delete(publisher.id);
      throw new PublisherAuthRequired(publisher.id);
    }

    await writeStorageState(context, publisher.id);
    return context;
  });
}

export async function runInteractiveLogin(
  publisher: PublisherDefinition,
): Promise<void> {
  return withLaunchLock(publisher.id, () =>
    runInteractiveLoginInner(publisher),
  );
}

async function runInteractiveLoginInner(
  publisher: PublisherDefinition,
): Promise<void> {
  const dir = sessionDirFor(publisher);
  await mkdir(dir, { recursive: true });

  await clearStaleLocks(dir);
  const context = await chromium.launchPersistentContext(dir, {
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    const page = await context.newPage();
    await page.goto(publisher.loginUrl, { waitUntil: "domcontentloaded" });

    const deadline = Date.now() + INTERACTIVE_LOGIN_TIMEOUT_MS;
    let iter = 0;
    while (Date.now() < deadline) {
      await new Promise((resolve) =>
        setTimeout(resolve, INTERACTIVE_LOGIN_POLL_MS),
      );
      iter++;
      try {
        // Cheap check on the user's current page (works if probe selector is
        // globally visible, e.g. nav-bar Logout link).
        if (await checkProbe(page, publisher)) {
          connectorLogger.info(
            { publisherId: publisher.id },
            "Publisher interactive login succeeded (in-place probe)",
          );
          // Capture session-scoped auth cookies before context.close() drops them.
          await writeStorageState(context, publisher.id);
          return;
        }
        // Every ~10s, fall back to the canonical probe URL on a separate
        // page. This covers SSO flows where the user lands on a page that
        // doesn't expose the probe selector (e.g. home vs. /account).
        if (iter % 5 === 0 && (await validateProbe(context, publisher))) {
          await page.bringToFront().catch(() => undefined);
          connectorLogger.info(
            { publisherId: publisher.id },
            "Publisher interactive login succeeded (probe URL)",
          );
          // Capture session-scoped auth cookies before context.close() drops them.
          await writeStorageState(context, publisher.id);
          return;
        }
      } catch {
        // Page may be navigating; keep polling.
      }
    }

    throw new Error(
      `Interactive login for "${publisher.id}" timed out after ${INTERACTIVE_LOGIN_TIMEOUT_MS}ms`,
    );
  } finally {
    await context.close();
  }
}

export async function primeStatusCache(
  publisherId: string,
  state: "connected" | "expired" | "never",
): Promise<void> {
  const checkedAt = new Date().toISOString();
  statusCache.set(publisherId, {
    state,
    checkedAt,
    expiresAt: Date.now() + STATUS_CACHE_TTL_MS,
  });
  if (state === "connected") {
    await writePersistedStatus(publisherId, { state, checkedAt });
  } else if (state === "expired") {
    await clearPersistedStatus(publisherId);
  }
}

export async function getStatus(
  publisher: PublisherDefinition,
): Promise<{ state: "connected" | "expired" | "never"; checkedAt: string }> {
  const cached = statusCache.get(publisher.id);
  if (cached && cached.expiresAt > Date.now()) {
    return { state: cached.state, checkedAt: cached.checkedAt };
  }

  const dir = sessionDirFor(publisher);
  const checkedAt = new Date().toISOString();

  if (!existsSync(dir)) {
    const result = { state: "never" as const, checkedAt };
    statusCache.set(publisher.id, {
      ...result,
      expiresAt: Date.now() + STATUS_CACHE_TTL_MS,
    });
    return result;
  }

  // Trust the persisted record written at login time. We do NOT launch
  // Chromium here — that would pop a window on every page load. Real fetches
  // (sync, extract) call ensureSession themselves and will clear this record
  // if the session has actually gone stale.
  const persisted = await readPersistedStatus(publisher.id);
  const state: "connected" | "expired" = persisted?.state ?? "expired";
  const result = { state, checkedAt: persisted?.checkedAt ?? checkedAt };
  statusCache.set(publisher.id, {
    ...result,
    expiresAt: Date.now() + STATUS_CACHE_TTL_MS,
  });
  return result;
}

export function invalidateStatusCache(publisherId: string): void {
  statusCache.delete(publisherId);
}
