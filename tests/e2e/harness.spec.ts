import { basename } from "node:path";
import { access } from "node:fs/promises";
import { captureNamedScreenshot } from "../support/browser/artifacts";
import { test, expect } from "../support/browser/test";

test("uses failure-retained Playwright artifacts", async ({ page }, testInfo) => {
  expect(testInfo.project.use.trace).toBe("retain-on-failure");
  expect(testInfo.project.use.screenshot).toBe("only-on-failure");
  expect(testInfo.project.use.video).toBe("retain-on-failure");

  await page.goto("/");
  const screenshotPath = await captureNamedScreenshot(page, testInfo, "Harness: named screenshot");

  await expect(access(screenshotPath)).resolves.toBeUndefined();
  expect(basename(screenshotPath)).toBe("harness-named-screenshot.png");
});

test("applies the configured desktop or mobile device profile", async ({ page }, testInfo) => {
  await page.goto("/");
  const metrics = await page.evaluate(() => ({
    devicePixelRatio: window.devicePixelRatio,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    maxTouchPoints: navigator.maxTouchPoints,
  }));

  if (testInfo.project.name === "desktop-chromium") {
    expect(metrics.innerWidth).toBe(1440);
    expect(metrics.innerHeight).toBe(900);
    expect(metrics.maxTouchPoints).toBe(0);
    return;
  }

  expect(metrics.maxTouchPoints).toBeGreaterThan(0);
  expect(metrics.innerWidth).toBeLessThanOrEqual(430);

  if (testInfo.project.name === "mobile-webkit") {
    expect(metrics).toMatchObject({
      devicePixelRatio: 3,
      innerHeight: 932,
      innerWidth: 430,
    });
  }
});
