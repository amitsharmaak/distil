import { defineConfig, devices } from "@playwright/test";
import { e2eBaseUrl, nextServerCommand } from "./tests/support/browser/server";

const failureArtifacts = {
  screenshot: "only-on-failure" as const,
  trace: "retain-on-failure" as const,
  video: "retain-on-failure" as const,
};

const webTestMatch = /e2e\/.*\.spec\.ts/;
const extensionTestMatch = /extension\/.*\.spec\.ts/;

export default defineConfig({
  testDir: "./tests",
  outputDir: "test-results/playwright",
  preserveOutput: "failures-only",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    ...failureArtifacts,
    baseURL: e2eBaseUrl,
  },
  webServer: {
    command: nextServerCommand,
    url: e2eBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "desktop-chromium",
      testMatch: webTestMatch,
      use: {
        ...devices["Desktop Chrome"],
        ...failureArtifacts,
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile-chromium",
      testMatch: webTestMatch,
      use: {
        ...devices["Pixel 7"],
        ...failureArtifacts,
      },
    },
    {
      name: "mobile-webkit",
      testMatch: webTestMatch,
      use: {
        ...devices["iPhone 14 Pro Max"],
        ...failureArtifacts,
        browserName: "webkit",
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
        viewport: { width: 430, height: 932 },
      },
    },
    {
      name: "extension",
      testMatch: extensionTestMatch,
      use: failureArtifacts,
    },
  ],
});
