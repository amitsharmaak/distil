import { expectNoBlockingAccessibilityViolations } from "../support/browser/accessibility";
import { test, expect } from "../support/browser/test";

test("saves an article and follows its receipt to the feed", async ({ page }) => {
  await page.route("**/api/v1/captures", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toMatchObject({
      url: "https://example.com/useful",
      source: "web",
    });
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        receipt: {
          id: "capture-e2e",
          normalizedUrl: "https://example.com/useful",
          status: "ready",
          itemId: "article-e2e",
          retryable: false,
          attempts: 1,
          createdAt: "2026-03-01T00:00:00Z",
          updatedAt: "2026-03-01T00:00:01Z",
        },
        duplicate: false,
      }),
    });
  });

  await page.goto("/save");
  await expect(page.getByRole("heading", { name: "Save an article" })).toBeVisible();
  await page.getByLabel("Article URL").fill("https://example.com/useful");
  await page.getByRole("button", { name: "Save to Distil" }).click();
  await expect(page.getByRole("link", { name: "Read article" })).toHaveAttribute(
    "href",
    "/feed/article-e2e"
  );
});

test("save screen fits the configured viewport and passes accessibility", async ({
  page,
}, testInfo) => {
  await page.goto("/save");
  await expect(page.getByLabel("Article URL")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save to Distil" })).toBeVisible();
  await expectNoBlockingAccessibilityViolations(page, testInfo);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(overflow).toBe(false);
});

test("publishes install metadata and keeps login outside the app shell", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome to Distil" })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest"
  );

  const response = await page.request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    short_name: "Distil",
    start_url: "/save",
    display: "standalone",
  });
});
