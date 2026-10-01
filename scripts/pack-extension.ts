/**
 * Packs browser-extension/ into dist/distil-extension-<version>.zip for the Chrome Web Store.
 *
 *   npm run extension:pack
 *
 * The store build differs from the unpacked development build in two ways:
 * - `key` is removed. The store assigns the listing its own id and may refuse a manifest that
 *   carries one; the app accepts every id in DISTIL_EXTENSION_IDS, so both builds can connect.
 * - localhost origins are removed from `host_permissions` and `externally_connectable`. They only
 *   serve local development and would widen the permissions reviewers and users see.
 *
 * Documentation (README.md, STORE.md), listing images (store-assets/) and dotfiles stay out of the zip. The zip is written without
 * dependencies (deflate entries, fixed timestamps), so the same sources give the same bytes.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { deflateRawSync } from "node:zlib";

export const EXTENSION_DIR = resolve(__dirname, "..", "browser-extension");
export const DIST_DIR = resolve(__dirname, "..", "dist");

const EXCLUDED_ENTRIES = new Set(["README.md", "STORE.md", "store-assets"]);
const VERSION_PATTERN = /^\d+(\.\d+){0,3}$/;

export interface ExtensionManifest {
  manifest_version: number;
  version: string;
  key?: string;
  host_permissions?: string[];
  externally_connectable?: { matches?: string[] };
  [field: string]: unknown;
}

function isLocalOrigin(pattern: string): boolean {
  try {
    const { hostname } = new URL(pattern.replace(/\*$/, ""));
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

/** Fails loudly on a manifest the store would reject or that would not load. */
export function validateManifest(manifest: ExtensionManifest): void {
  if (manifest.manifest_version !== 3) throw new Error("manifest_version must be 3");
  if (typeof manifest.version !== "string" || !VERSION_PATTERN.test(manifest.version)) {
    throw new Error(`manifest version "${manifest.version}" must be 1-4 dot-separated integers`);
  }
}

/** The manifest as uploaded to the store: no `key`, no localhost origins. */
export function storeManifest(manifest: ExtensionManifest): ExtensionManifest {
  const { key: _key, ...rest } = manifest;
  const result: ExtensionManifest = { ...rest };
  if (manifest.host_permissions) {
    result.host_permissions = manifest.host_permissions.filter((origin) => !isLocalOrigin(origin));
  }
  if (manifest.externally_connectable?.matches) {
    result.externally_connectable = {
      ...manifest.externally_connectable,
      matches: manifest.externally_connectable.matches.filter((origin) => !isLocalOrigin(origin)),
    };
  }
  return result;
}

/** Relative paths (forward slashes, sorted) of the files that ship in the zip. */
export function listPackFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".") || (dir === root && EXCLUDED_ENTRIES.has(name))) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(relative(root, path).split(sep).join("/"));
    }
  };
  walk(root);
  return files.sort();
}

/** Every file the manifest points at must be in the package, or Chrome refuses to load it. */
export function assertReferencedFilesPresent(manifest: ExtensionManifest, files: string[]): void {
  const present = new Set(files);
  const referenced = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string") referenced.add(value);
    else if (value && typeof value === "object") Object.values(value).forEach(add);
  };
  add(manifest.icons);
  add(
    (manifest.action as { default_icon?: unknown; default_popup?: unknown } | undefined)
      ?.default_icon
  );
  add((manifest.action as { default_popup?: unknown } | undefined)?.default_popup);
  add((manifest.background as { service_worker?: unknown } | undefined)?.service_worker);
  add((manifest.options_ui as { page?: unknown } | undefined)?.page);
  const missing = [...referenced].filter((file) => !present.has(file));
  if (missing.length > 0)
    throw new Error(`manifest references missing files: ${missing.join(", ")}`);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// 1 January 2020 00:00 in MS-DOS date/time, so the archive does not depend on file mtimes.
const DOS_TIME = 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;

/** A minimal zip (deflate, no zip64) of the given entries, in order. */
export function createZip(entries: { name: string; data: Uint8Array }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + compressed.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

export function packExtension(sourceDir = EXTENSION_DIR, outDir = DIST_DIR) {
  const manifest = JSON.parse(
    readFileSync(join(sourceDir, "manifest.json"), "utf8")
  ) as ExtensionManifest;
  validateManifest(manifest);
  const files = listPackFiles(sourceDir);
  assertReferencedFilesPresent(manifest, files);

  const entries = files.map((name) => ({
    name,
    data:
      name === "manifest.json"
        ? Buffer.from(`${JSON.stringify(storeManifest(manifest), null, 2)}\n`)
        : readFileSync(join(sourceDir, name)),
  }));
  mkdirSync(outDir, { recursive: true });
  const zipPath = join(outDir, `distil-extension-${manifest.version}.zip`);
  writeFileSync(zipPath, createZip(entries));
  return { zipPath, version: manifest.version, files };
}

if (process.argv[1]?.endsWith("pack-extension.ts")) {
  try {
    const { zipPath, version, files } = packExtension();
    console.log(
      `Packed Distil extension ${version}: ${files.length} files → ${relative(process.cwd(), zipPath)}`
    );
  } catch (error) {
    console.error(
      `extension:pack failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}
