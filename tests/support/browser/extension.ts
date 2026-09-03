import { access, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  chromium,
  type BrowserContext,
  type Page,
  type TestInfo,
  type Video,
  type Worker,
} from "@playwright/test";

export const defaultExtensionPath = resolve(process.cwd(), "browser-extension");

export interface ExtensionSession {
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
  videos: Set<Video>;
}

export interface LaunchExtensionOptions {
  extensionPath?: string;
  testInfo: TestInfo;
}

function extensionIdFromWorker(worker: Worker): string {
  const workerUrl = new URL(worker.url());
  if (workerUrl.protocol !== "chrome-extension:") {
    throw new Error(`Unexpected extension worker URL: ${worker.url()}`);
  }
  return workerUrl.hostname;
}

/** Launch the checked-in MV3 extension in an isolated persistent Chromium profile. */
export async function launchExtension(options: LaunchExtensionOptions): Promise<ExtensionSession> {
  const extensionPath = options.extensionPath ?? defaultExtensionPath;
  await access(resolve(extensionPath, "manifest.json"));

  const profilePath = options.testInfo.outputPath("extension-profile");
  const videoPath = options.testInfo.outputPath("video");
  await mkdir(videoPath, { recursive: true });

  const context = await chromium.launchPersistentContext(profilePath, {
    channel: "chromium",
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    recordVideo: {
      dir: videoPath,
      size: { width: 1280, height: 720 },
    },
    viewport: { width: 1280, height: 720 },
  });
  const videos = new Set<Video>();
  const rememberVideo = (page: Page) => {
    const video = page.video();
    if (video !== null) videos.add(video);
  };
  context.pages().forEach(rememberVideo);
  context.on("page", rememberVideo);

  try {
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });

    const serviceWorker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker", { timeout: 15_000 }));

    return {
      context,
      extensionId: extensionIdFromWorker(serviceWorker),
      serviceWorker,
      videos,
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function attachIfPresent(
  testInfo: TestInfo,
  name: string,
  path: string,
  contentType: string
): Promise<void> {
  try {
    await access(path);
    await testInfo.attach(name, { path, contentType });
  } catch {
    // Chromium does not emit every artifact when no page was opened.
  }
}

/** Close a persistent extension context and apply retain-on-failure semantics. */
export async function closeExtension(session: ExtensionSession, testInfo: TestInfo): Promise<void> {
  const failed = testInfo.status !== testInfo.expectedStatus;
  const tracePath = testInfo.outputPath("trace.zip");
  const screenshotPath = testInfo.outputPath("test-failed-1.png");
  const openPages = session.context.pages().filter((page) => !page.isClosed());

  if (failed && openPages[0] !== undefined) {
    await openPages[0].screenshot({ path: screenshotPath, fullPage: true });
  }

  if (failed) {
    await session.context.tracing.stop({ path: tracePath });
  } else {
    await session.context.tracing.stop();
  }
  await session.context.close();

  const videoFiles = await Promise.all(
    [...session.videos].map(async (video) => {
      try {
        return await video.path();
      } catch {
        return undefined;
      }
    })
  );

  if (failed) {
    await attachIfPresent(testInfo, "trace", tracePath, "application/zip");
    await attachIfPresent(testInfo, "screenshot", screenshotPath, "image/png");
    await Promise.all(
      videoFiles.map((path, index) =>
        path === undefined
          ? Promise.resolve()
          : attachIfPresent(testInfo, `video-${index + 1}`, path, "video/webm")
      )
    );
    return;
  }

  await rm(videoPathFor(testInfo), { recursive: true, force: true });
}

function videoPathFor(testInfo: TestInfo): string {
  return dirname(testInfo.outputPath("video", "placeholder"));
}
