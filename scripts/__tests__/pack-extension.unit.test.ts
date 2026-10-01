import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

import {
  EXTENSION_DIR,
  assertReferencedFilesPresent,
  crc32,
  createZip,
  listPackFiles,
  packExtension,
  storeManifest,
  validateManifest,
  type ExtensionManifest,
} from "../pack-extension";

/** Independent reader: walks the central directory and inflates each entry. */
function readZip(zip: Buffer): Map<string, Buffer> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i += 1) {
    expect(zip.readUInt32LE(cursor)).toBe(0x02014b50);
    const crc = zip.readUInt32LE(cursor + 16);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const dataStart = localOffset + 30 + localNameLength;
    const data = inflateRawSync(zip.subarray(dataStart, dataStart + compressedSize));
    expect(crc32(data)).toBe(crc);
    files.set(name, data);
    cursor += 46 + nameLength;
  }
  return files;
}

const sourceManifest = (): ExtensionManifest =>
  JSON.parse(readFileSync(join(EXTENSION_DIR, "manifest.json"), "utf8")) as ExtensionManifest;

describe("pack-extension", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("strips the key and localhost origins for the store, keeping everything else", () => {
    const manifest = sourceManifest();
    expect(manifest.key).toBeTruthy();
    const store = storeManifest(manifest);

    expect(store.key).toBeUndefined();
    expect(store.host_permissions).toEqual(["https://distilai.app/*"]);
    expect(store.externally_connectable?.matches).toEqual(["https://distilai.app/*"]);
    expect(store.version).toBe(manifest.version);
    expect(store.permissions).toEqual(manifest.permissions);
    expect(store.optional_host_permissions).toEqual(manifest.optional_host_permissions);
    expect(manifest.host_permissions).toContain("http://localhost:3000/*");
  });

  it("rejects manifests the store would refuse", () => {
    expect(() => validateManifest({ ...sourceManifest(), manifest_version: 2 })).toThrow(
      "manifest_version must be 3"
    );
    expect(() => validateManifest({ ...sourceManifest(), version: "2.0.0-beta" })).toThrow(
      'manifest version "2.0.0-beta"'
    );
    expect(() => validateManifest(sourceManifest())).not.toThrow();
  });

  it("ships the code and icons but not the documentation", () => {
    const files = listPackFiles(EXTENSION_DIR);
    expect(files).toEqual(
      expect.arrayContaining(["manifest.json", "background.js", "popup.html", "icons/icon128.png"])
    );
    expect(files).not.toContain("README.md");
    expect(files).not.toContain("STORE.md");
    expect(files.some((f) => f.startsWith("store-assets/"))).toBe(false);
    expect(() => assertReferencedFilesPresent(sourceManifest(), files)).not.toThrow();
    expect(() =>
      assertReferencedFilesPresent(
        sourceManifest(),
        files.filter((f) => f !== "background.js")
      )
    ).toThrow("manifest references missing files: background.js");
  });

  it("writes a readable, deterministic zip with the store manifest", () => {
    const outDir = mkdtempSync(join(tmpdir(), "distil-pack-"));
    try {
      const first = packExtension(EXTENSION_DIR, outDir);
      const bytes = readFileSync(first.zipPath);
      expect(first.zipPath).toBe(join(outDir, `distil-extension-${first.version}.zip`));

      const entries = readZip(bytes);
      expect([...entries.keys()]).toEqual(first.files);
      const packed = JSON.parse(
        entries.get("manifest.json")!.toString("utf8")
      ) as ExtensionManifest;
      expect(packed).toEqual(storeManifest(sourceManifest()));
      expect(entries.get("background.js")).toEqual(
        readFileSync(join(EXTENSION_DIR, "background.js"))
      );

      const second = packExtension(EXTENSION_DIR, outDir);
      expect(readFileSync(second.zipPath)).toEqual(bytes);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("keeps an empty archive valid", () => {
    expect(readZip(createZip([])).size).toBe(0);
  });
});
