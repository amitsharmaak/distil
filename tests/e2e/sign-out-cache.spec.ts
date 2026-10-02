import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import type { Page } from "@playwright/test";

import { createSessionToken } from "../../src/lib/auth/session";
import { SESSION_COOKIE_NAME } from "../../src/lib/auth/constants";
import { test, expect } from "../support/browser/test";

/**
 * Sign-out must not leave a previous account's pages reachable in the tab.
 *
 * `experimental.staleTimes` keeps visited route output in the browser's router cache for thirty
 * minutes, and `router.refresh()` only clears the current route. Sign-out therefore leaves by a
 * full document load, which discards the whole router cache; Back and Forward then ask the server
 * again, and the server redirects because the session is gone.
 *
 * The first test runs anywhere and checks the document load itself. The second needs the local
 * PostgreSQL and legacy-auth values (docs/runbooks/local-development.md), because only then are
 * Today, Feed and the reader server-rendered behind a real session; it skips itself otherwise
 * (CI). Hosted Neon Auth is not available locally, so the sign-out request is fulfilled here and
 * the session cookie is removed the way the provider's response would remove it.
 */
loadEnvConfig(process.cwd());

const databaseReady = Boolean(
  process.env.DATABASE_URL &&
  process.env.DISTIL_SESSION_SECRET &&
  process.env.DISTIL_WEB_PASSWORD_HASH &&
  process.env.DISTIL_LEGACY_USER_ID &&
  process.env.DISTIL_TEST_MODE !== "1" &&
  /(localhost|127\.0\.0\.1)/.test(process.env.DATABASE_URL)
);

const SIGNED_OUT_URL = /\/(sign-in|login)(\?.*)?$/;

const TENANT_SCRIPT = `
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
(async () => {
  const unwrap = (module: any) => module.default ?? module;
  const { withTenantRepositories } = unwrap(await import("./src/lib/database"));
  const { createAuthContext } = unwrap(await import("./src/lib/contracts"));
  const [mode, runId, ids] = JSON.parse(process.env.SIGN_OUT_E2E_ARGS as string);
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
    for (let index = 0; index < 2; index += 1) {
      const stored = await repositories.items.insert({
        id: "e2e-signout-" + runId + "-" + index,
        title: "Private fixture " + runId + " " + (index + 1),
        summary: "A deterministic item that only its owner may see.",
        fullContent: "Private fixture body text.",
        sourceType: "manual",
        contentType: "article",
        topics: ["testing"],
        url: "https://articles.example.test/signout-" + runId + "-" + index,
        priority: "high",
        isRead: false,
        createdAt: new Date(base + (2 - index) * 1000).toISOString(),
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
    env: { ...process.env, SIGN_OUT_E2E_ARGS: JSON.stringify([mode, runId, ids]) },
  });
  const match = /IDS:(\[.*\])/.exec(output);
  return match ? (JSON.parse(match[1]) as string[]) : [];
}

/** The account centre's own reads, so the page renders its Sign out control in any auth mode. */
async function mockAccountCentre(page: Page, onSignOut: () => Promise<void>): Promise<void> {
  const json = (body: unknown, status = 200) => ({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  await page.route("**/api/v1/account/deletion", (route) => route.fulfill(json({}, 404)));
  await page.route("**/api/v1/account/sessions", (route) =>
    route.fulfill(
      json({
        sessions: [
          {
            id: "session-1",
            createdAt: "2026-10-01T00:00:00.000Z",
            updatedAt: "2026-10-01T00:00:00.000Z",
            expiresAt: "2026-11-01T00:00:00.000Z",
            current: true,
          },
        ],
      })
    )
  );
  await page.route("**/api/v1/account/usage", (route) => route.fulfill(json({})));
  await page.route("**/api/v1/account/exports", (route) => route.fulfill(json({ exports: [] })));
  await page.route("**/api/v1/account", (route) =>
    route.fulfill(
      json({
        account: {
          userId: "00000000-0000-4000-8000-000000000001",
          status: "active",
          displayName: "Fixture reader",
          email: "reader@example.test",
          timezone: "UTC",
          onboardingCompleted: true,
          privacy: { allowPersonalization: true, allowAiProcessing: true },
        },
      })
    )
  );
  await page.route("**/api/auth/sign-out", async (route) => {
    await onSignOut();
    await route.fulfill(json({}));
  });
}

/** A value on `window` survives client-side navigation and is lost on a document load. */
async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __sameDocument?: boolean }).__sameDocument = true;
  });
}
async function isSameDocument(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as unknown as { __sameDocument?: boolean }).__sameDocument === true
  );
}

/** Follow a visible in-app link (sidebar on desktop, tab bar on phones) without a reload. */
async function clientNavigate(page: Page, href: string): Promise<void> {
  await page.locator(`a[href="${href}"]:visible`).first().click();
  await expect(page).toHaveURL(new RegExp(`${href.replace(/[/?]/g, "\\$&")}(\\?.*)?$`));
}

test("sign-out leaves the app by a full document load", async ({ page }) => {
  test.skip(databaseReady, "Covered by the seeded two-document test below.");
  await page.route("**/api/v1/feed?*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"items":[]}' })
  );
  await mockAccountCentre(page, async () => undefined);

  await page.goto("/settings");
  await page.getByRole("tab", { name: /Account/ }).click();
  await page.getByRole("link", { name: "Open account centre" }).click();
  await expect(page).toHaveURL(/\/account$/);
  const signOut = page.getByRole("button", { name: "Sign out" });
  await expect(signOut).toBeVisible();
  await markDocument(page);
  expect(await isSameDocument(page)).toBe(true);

  await signOut.click();

  await expect(page).toHaveURL(SIGNED_OUT_URL);
  // A client-side replace would have kept the window, and with it the router cache.
  expect(await isSameDocument(page)).toBe(false);
  await page.goBack();
  await expect(page).not.toHaveURL(/\/account$/);
  expect(await isSameDocument(page)).toBe(false);
});

test.describe("sign-out with a real session and server-rendered content", () => {
  test.skip(!databaseReady, "Needs the local PostgreSQL and legacy-auth values.");

  const runId = randomUUID().slice(0, 8);
  const seeded: string[] = [];
  const privateText = new RegExp(`Private fixture ${runId}`);

  test.beforeAll(() => {
    seeded.push(...runTenantScript("seed", runId));
  });

  test.afterAll(() => {
    if (seeded.length > 0) runTenantScript("cleanup", runId, seeded);
  });

  test("Back and Forward never show the previous account's Today, Feed or reader", async ({
    page,
  }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://127.0.0.1:3100";
    await page.context().addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: await createSessionToken(process.env.DISTIL_SESSION_SECRET as string),
        url: baseURL,
      },
    ]);
    await mockAccountCentre(page, async () => {
      await page.context().clearCookies();
    });

    // Visit the server-rendered surfaces by client-side navigation, as a reader would.
    const today = await page.goto("/");
    // Private pages must stay out of the HTTP cache and the browser's back/forward cache.
    expect(today?.headers()["cache-control"] ?? "").toContain("no-store");
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
    await expect(page.getByText(privateText).first()).toBeVisible();
    await clientNavigate(page, "/feed");
    await expect(page.getByText(privateText).first()).toBeVisible();
    await page.locator(`a[href^="/feed/${seeded[0]}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/feed/${seeded[0]}`));
    await expect(page.getByRole("heading", { level: 1, name: privateText })).toBeVisible();
    await page.getByRole("link", { name: "Back to feed" }).first().click();
    await expect(page).toHaveURL(/\/feed(\?.*)?$/);
    await clientNavigate(page, "/settings");
    await page.getByRole("tab", { name: /Account/ }).click();
    await page.getByRole("link", { name: "Open account centre" }).click();
    await expect(page).toHaveURL(/\/account$/);
    const signOut = page.getByRole("button", { name: "Sign out" });
    await expect(signOut).toBeVisible();
    await markDocument(page);

    await signOut.click();

    await expect(page).toHaveURL(SIGNED_OUT_URL);
    // A client-side replace would have kept the window, and with it the router cache.
    expect(await isSameDocument(page)).toBe(false);
    await expect(page.getByText(privateText)).toHaveCount(0);

    // Walk the whole history in both directions (Settings, Feed, the reader, Feed, Today).
    // Every entry must be answered by the server, which no longer has a session, so nothing
    // the previous account read may appear, not even while the redirect is in flight.
    const walk = async (move: () => Promise<unknown>) => {
      for (let step = 0; step < 5; step += 1) {
        let shown = 0;
        const watch = async () => {
          shown = Math.max(shown, await page.getByText(privateText).count());
        };
        await move();
        for (let tick = 0; tick < 10; tick += 1) {
          await watch().catch(() => undefined);
          await page.waitForTimeout(50);
        }
        await expect(page).toHaveURL(SIGNED_OUT_URL);
        await watch();
        expect(shown, `history step ${step} showed private content`).toBe(0);
      }
    };
    await walk(() => page.goBack());
    await walk(() => page.goForward());

    // Protected routes redirect to the sign-in page.
    for (const path of ["/", "/feed", `/feed/${seeded[0]}`, "/research", "/archive"]) {
      await page.goto(path);
      await expect(page).toHaveURL(SIGNED_OUT_URL);
      await expect(page.getByText(privateText)).toHaveCount(0);
    }
  });
});
