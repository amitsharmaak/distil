import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import manifest from "@/app/manifest";
import { LOCKUP_WIDTH } from "../artwork";
import { DistilLogo } from "../distil-logo";
import { ICON_VERSION } from "../icon-version";

/** A missing even-odd fill rule once filled in the d's counter during vector export. */
it.each(["export", "component"])(
  "preserves the wordmark's open counter in the %s",
  async (kind) => {
    const svg =
      kind === "export"
        ? readFileSync(resolve("public/brand/distil-wordmark.svg"))
        : Buffer.from(renderToStaticMarkup(<DistilLogo />));
    const width = kind === "export" ? 612 : 317;
    const height = kind === "export" ? 230 : 104;
    const { data, info } = await sharp(svg, { density: 288 })
      .resize(width, height)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const [holeX, holeY] = kind === "export" ? [70, 140] : [128, 67];
    const [strokeX, strokeY] = kind === "export" ? [15, 145] : [109, 68];
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    expect(alphaAt(holeX, holeY)).toBe(0);
    expect(alphaAt(strokeX, strokeY)).toBeGreaterThan(240);
  }
);

/** The 2026-10-05 decision: 24 units of clear space between the mark's ink and the wordmark's. */
it("separates the mark and the wordmark by 24 units in the lockup", async () => {
  const scale = 10;
  const svg = Buffer.from(renderToStaticMarkup(<DistilLogo />));
  const { data, info } = await sharp(svg)
    .resize(Math.round(LOCKUP_WIDTH * scale), 104 * scale)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Column coverage of ink, split by hue: the mark is cobalt, the wordmark is currentColor.
  const inkColumns = new Set<number>();
  const markColumns = new Set<number>();
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 4;
      if (data[offset + 3] < 128) continue;
      if (data[offset + 2] > 200 && data[offset] < 100) markColumns.add(x);
      else inkColumns.add(x);
    }
  }
  const markRight = (Math.max(...markColumns) + 1) / scale;
  const wordmarkLeft = Math.min(...inkColumns) / scale;
  expect(markRight).toBeCloseTo(80, 0);
  expect(wordmarkLeft - markRight).toBeCloseTo(24, 0);
  expect(LOCKUP_WIDTH).toBeCloseTo(104 + 612 * (80 / 230), 6);
});

it("keeps the complete maskable symbol inside the safe circle on an opaque background", async () => {
  const { data, info } = await sharp(resolve("public/icons/icon-maskable-512.png"))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect([info.width, info.height]).toEqual([512, 512]);
  let symbolPixels = 0;
  let transparentPixels = 0;
  let clippedPixels = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 4;
      if (data[offset + 3] !== 255) transparentPixels += 1;
      if (data[offset] > 100) {
        symbolPixels += 1;
        if ((x - 255.5) ** 2 + (y - 255.5) ** 2 > 204.8 ** 2) clippedPixels += 1;
      }
    }
  }
  expect(symbolPixels).toBeGreaterThan(10_000);
  expect(transparentPixels).toBe(0);
  expect(clippedPixels).toBe(0);
});

/** An installed app keeps the icon it captured until the manifest names a different URL. */
it("versions every installed-app icon URL and points at a generated file", () => {
  const icons = manifest().icons ?? [];
  expect(icons.map((icon) => icon.purpose)).toEqual(["any", "any", "maskable"]);
  for (const { src } of icons) {
    const [path, query] = src.split("?");
    expect(query).toBe(`v=${ICON_VERSION}`);
    expect(existsSync(resolve(`public${path}`))).toBe(true);
  }
});

/** The installed app opens on Today; Save is a shortcut on its icon, not the start page. */
it("starts the installed app on Today with a pinned identity and a Save shortcut", () => {
  const { id, start_url, scope, shortcuts = [] } = manifest();
  expect({ id, start_url, scope }).toEqual({ id: "/", start_url: "/", scope: "/" });
  expect(shortcuts.map(({ name, url }) => ({ name, url }))).toEqual([
    { name: "Save a link", url: "/save" },
  ]);
  for (const { src } of shortcuts.flatMap((shortcut) => shortcut.icons ?? [])) {
    expect(existsSync(resolve(`public${src.split("?")[0]}`))).toBe(true);
  }
});
