/**
 * Export the approved vector masters into every app and extension asset.
 * npm run brand:generate writes them; npm run brand:check detects stale or missing outputs.
 * No network, font files, secrets or AI calls are involved.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  BRAND_COLORS,
  LOCKUP_VIEWBOX,
  LOCKUP_WIDTH,
  MARK_PATH,
  WORDMARK_HEIGHT,
  WORDMARK_PATH,
  WORDMARK_TRANSFORM,
  WORDMARK_WIDTH,
} from "../src/components/brand/artwork";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const stale: string[] = [];
let exported = 0;

function svg(viewBox: string, width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}" role="img" aria-label="Distil">${body}</svg>\n`;
}

function mark(color: string, transform = ""): string {
  return `<path fill="${color}"${transform ? ` transform="${transform}"` : ""} d="${MARK_PATH}"/>`;
}

function lettering(color: string, transform = ""): string {
  return `<path fill="${color}" fill-rule="evenodd"${transform ? ` transform="${transform}"` : ""} d="${WORDMARK_PATH}"/>`;
}

function lockup(symbolColor: string, wordColor: string): string {
  return svg(
    LOCKUP_VIEWBOX,
    LOCKUP_WIDTH,
    104,
    mark(symbolColor) + lettering(wordColor, WORDMARK_TRANSFORM)
  );
}

function tile(maskable = false): string {
  // The maskable mark fits wholly within the central 80%-diameter safe circle.
  const scale = maskable ? 3 : 3.4;
  const x = (512 - 80 * scale) / 2;
  const y = (512 - 104 * scale) / 2;
  return svg(
    "0 0 512 512",
    512,
    512,
    `<rect width="512" height="512"${maskable ? "" : ' rx="108"'} fill="${BRAND_COLORS.ink}"/>` +
      mark(BRAND_COLORS.ivory, `translate(${x} ${y}) scale(${scale})`)
  );
}

async function output(path: string, content: string | Buffer): Promise<void> {
  const bytes = typeof content === "string" ? Buffer.from(content) : content;
  const destination = resolve(root, path);
  if (check) {
    const existing = await readFile(destination).catch(() => null);
    if (!existing?.equals(bytes)) stale.push(path);
  } else {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  exported += 1;
}

async function png(source: string, size: number): Promise<Buffer> {
  return sharp(Buffer.from(source), { density: 144 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** ICO directory followed by PNG frames, supported by current browser favicon readers. */
function ico(frames: { size: number; bytes: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach(({ size, bytes }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(bytes.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += bytes.length;
  });
  return Buffer.concat([header, ...frames.map(({ bytes }) => bytes)]);
}

async function main(): Promise<void> {
  const full = lockup(BRAND_COLORS.cobalt, BRAND_COLORS.ink);
  const icon = tile();
  const maskable = tile(true);
  const vectors: Record<string, string> = {
    "public/brand/distil-logo.svg": full,
    "public/brand/distil-logo-light.svg": lockup(BRAND_COLORS.cobalt, BRAND_COLORS.ivory),
    "public/brand/distil-logo-mono.svg": lockup(BRAND_COLORS.ink, BRAND_COLORS.ink),
    "public/brand/distil-wordmark.svg": svg(
      `0 0 ${WORDMARK_WIDTH} ${WORDMARK_HEIGHT}`,
      WORDMARK_WIDTH,
      WORDMARK_HEIGHT,
      lettering(BRAND_COLORS.ink)
    ),
    "public/brand/distil-app-icon.svg": icon,
    "public/brand/distil-app-icon-maskable.svg": maskable,
    "public/logo.svg": icon,
    "src/app/icon.svg": icon,
    "browser-extension/brand.svg": full,
  };
  for (const [suffix, color] of [
    ["", BRAND_COLORS.cobalt],
    ["-mono", BRAND_COLORS.ink],
    ["-light", BRAND_COLORS.ivory],
  ]) {
    vectors[`public/brand/distil-mark${suffix}.svg`] = svg(
      "0 0 104 104",
      104,
      104,
      mark(color, "translate(12 0)")
    );
  }
  for (const [path, source] of Object.entries(vectors)) await output(path, source);

  for (const size of [16, 32, 48, 128]) {
    await output(`browser-extension/icons/icon${size}.png`, await png(icon, size));
  }
  for (const size of [192, 512]) {
    await output(`public/icons/icon-${size}.png`, await png(icon, size));
  }
  await output("public/icons/icon-maskable-512.png", await png(maskable, 512));
  // Apple applies its own corner mask, so provide an opaque full-bleed background.
  await output("public/icons/apple-touch-icon.png", await png(maskable, 180));
  await output("public/logo.png", await png(icon, 512));
  const frames = await Promise.all(
    [16, 32, 48, 64].map(async (size) => ({ size, bytes: await png(icon, size) }))
  );
  await output("src/app/favicon.ico", ico(frames));

  const promoScale = 344 / LOCKUP_WIDTH;
  const promo = svg(
    "0 0 440 280",
    440,
    280,
    `<rect width="440" height="280" fill="${BRAND_COLORS.ivory}"/>` +
      `<g transform="translate(48 ${(280 - 104 * promoScale) / 2}) scale(${promoScale})">` +
      mark(BRAND_COLORS.cobalt) +
      lettering(BRAND_COLORS.ink, WORDMARK_TRANSFORM) +
      "</g>"
  );
  await output(
    "browser-extension/store-assets/promo-small-440x280.png",
    await sharp(Buffer.from(promo)).png({ compressionLevel: 9 }).toBuffer()
  );

  if (stale.length)
    throw new Error(`Run npm run brand:generate; stale assets: ${stale.join(", ")}`);
  console.log(`${check ? "Verified" : "Generated"} ${exported} Distil brand assets.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Brand export failed");
  process.exitCode = 1;
});
