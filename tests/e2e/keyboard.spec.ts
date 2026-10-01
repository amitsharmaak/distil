import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { createSessionToken } from "../../src/lib/auth/session";
import { SESSION_COOKIE_NAME } from "../../src/lib/auth/constants";
import { test, expect } from "../support/browser/test";

/**
 * Keyboard-only navigation. The reader and the list rows are server-rendered
 * from PostgreSQL, so the full-flow test needs the local Docker database and
 * legacy-auth values from `.env.local` (docs/runbooks/local-development.md);
 * it skips itself where those are absent (CI). The remaining tests mock the
 * feed API and run anywhere.
 */
loadEnvConfig(process.cwd());

const databaseReady = Boolean(
  process.env.DATABASE_URL &&
  process.env.DISTIL_SESSION_SECRET &&
  process.env.DISTIL_LEGACY_USER_ID &&
  /(localhost|127\.0\.0\.1)/.test(process.env.DATABASE_URL)
);

const HELP_TITLE = "Keyboard shortcuts";

/** When auth is configured for the dev server, present a valid session cookie. */
async function signIn(page: Page): Promise<void> {
  const secret = process.env.DISTIL_SESSION_SECRET;
  if (!secret || !databaseReady) return;
  await page.context().addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: await createSessionToken(secret),
      url: test.info().project.use.baseURL ?? "http://127.0.0.1:3100",
    },
  ]);
}

/**
 * Seed or remove fixture items through the application's own repositories in a
 * `tsx` child process (Playwright does not resolve the `@/` path alias inside
 * `src/`). Runs against the local database named by `.env.local` only.
 */
const TENANT_SCRIPT = `
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
(async () => {
  const unwrap = (module: any) => module.default ?? module;
  const { withTenantRepositories } = unwrap(await import("./src/lib/database"));
  const { createAuthContext } = unwrap(await import("./src/lib/contracts"));
  const [mode, runId, ids] = JSON.parse(process.env.KBD_E2E_ARGS as string);
  const userId = process.env.DISTIL_LEGACY_USER_ID as string;
  const context = createAuthContext({
    userId,
    actorKind: "user",
    actorId: userId,
    requestId: crypto.randomUUID(),
  });
  const created: string[] = [];
  await withTenantRepositories(context, async (repositories) => {
    if (mode === "cleanup") {
      for (const id of ids) await repositories.items.delete(id);
      return;
    }
    const base = Date.now();
    for (let index = 0; index < 3; index += 1) {
      const stored = await repositories.items.insert({
        id: "e2e-kbd-" + runId + "-" + index,
        title: "Keyboard fixture " + runId + " " + (index + 1),
        summary: "A deterministic item for the keyboard end-to-end test.",
        fullContent: "Keyboard fixture body text.",
        sourceType: "manual",
        contentType: "article",
        topics: ["testing"],
        url: "https://articles.example.test/kbd-" + runId + "-" + index,
        priority: "medium",
        isRead: false,
        createdAt: new Date(base + (3 - index) * 1000).toISOString(),
        processingStatus: "ready",
      });
      created.push(stored.id);
    }
  });
  process.stdout.write("IDS:" + JSON.stringify(created));
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

function runTenantScript(mode: "seed" | "cleanup", runId: string, ids: string[] = []): string[] {
  const output = execFileSync("npx", ["tsx", "--eval", TENANT_SCRIPT], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, KBD_E2E_ARGS: JSON.stringify([mode, runId, ids]) },
  });
  const match = /IDS:(\[.*\])/.exec(output);
  return match ? (JSON.parse(match[1]) as string[]) : [];
}

async function mockFeed(page: Page): Promise<void> {
  if (databaseReady) return;
  await page.route("**/api/v1/feed?*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"items":[]}' })
  );
}

/**
 * The dev server hydrates lazily, so the very first keypress of a test can land
 * before the shortcut listener exists. Retry the keys until their effect shows.
 */
async function pressUntil(page: Page, keys: string[], effect: () => Promise<void>) {
  await expect(async () => {
    for (const key of keys) await page.keyboard.press(key);
    await effect();
  }).toPass({ timeout: 15_000 });
}

async function expectNoNestedInteractive(page: Page) {
  const results = await new AxeBuilder({ page }).withRules(["nested-interactive"]).analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

async function activeRowItemId(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.activeElement?.closest("[data-row]")?.getAttribute("data-item-id") ?? null
  );
}

test.describe("keyboard navigation with seeded items", () => {
  test.skip(!databaseReady, "Needs the local PostgreSQL and .env.local auth values.");

  const runId = randomUUID().slice(0, 8);
  const seeded: string[] = [];

  test.beforeAll(() => {
    const created = runTenantScript("seed", runId);
    seeded.push(...created);
  });

  test.afterAll(() => {
    if (seeded.length > 0) runTenantScript("cleanup", runId, seeded);
  });

  test("drives Today, Feed, the reader and the help dialog from the keyboard", async ({ page }) => {
    await signIn(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();

    await pressUntil(page, ["g", "f"], () => expect(page).toHaveURL(/\/feed$/, { timeout: 1_500 }));

    const rows = page.locator("article[data-row][data-item-id]");
    await expect(rows.first()).toBeVisible();
    const secondId = await rows.nth(1).getAttribute("data-item-id");
    expect(secondId).toBeTruthy();

    await page.keyboard.press("j");
    await page.keyboard.press("j");
    await expect.poll(() => activeRowItemId(page)).toBe(secondId);

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/feed/${secondId}`));

    const markRead = page.getByRole("button", { name: "Mark as read" });
    await expect(markRead).toBeEnabled();
    const patched = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/v1/items/${secondId}/state`) &&
        response.request().method() === "PATCH"
    );
    await page.keyboard.press("r");
    expect((await patched).ok()).toBe(true);
    // Marking read advances to the next item; the read state is persisted.
    await expect(page).not.toHaveURL(new RegExp(`/feed/${secondId}(\\?|$)`));

    await page.keyboard.press("u");
    await expect(page).toHaveURL(/\/feed(\?.*)?$/);

    await page.keyboard.press("?");
    const dialog = page.getByRole("dialog", { name: HELP_TITLE });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Lists");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("reader page has no nested interactive controls", async ({ page }) => {
    await signIn(page);
    await page.goto(`/feed/${seeded[0]}`);
    await expect(page.getByRole("button", { name: "Mark as read" })).toBeVisible();
    await expectNoNestedInteractive(page);
  });
});

test("does not open the help dialog when typing ? into the search input", async ({ page }) => {
  await signIn(page);
  await mockFeed(page);
  await page.goto("/feed");
  const search = page
    .getByRole("searchbox")
    .or(page.getByPlaceholder(/search/i))
    .first();
  await expect(search).toBeVisible();
  await search.click();
  await page.keyboard.type("?");
  await expect(search).toHaveValue("?");
  await expect(page.getByRole("dialog", { name: HELP_TITLE })).toHaveCount(0);
});

test("feed and the help dialog have no nested interactive controls", async ({ page }) => {
  await signIn(page);
  await mockFeed(page);
  await page.goto("/feed");
  await expect(page.getByRole("heading", { name: "Feed", level: 1 })).toBeVisible();
  await expectNoNestedInteractive(page);

  const dialog = page.getByRole("dialog", { name: HELP_TITLE });
  await pressUntil(page, ["?"], () => expect(dialog).toBeVisible({ timeout: 1_500 }));
  await expectNoNestedInteractive(page);
});
