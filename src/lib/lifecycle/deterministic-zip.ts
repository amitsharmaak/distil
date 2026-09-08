import { createHash } from "node:crypto";

export interface DeterministicZipEntry {
  name: string;
  body: Uint8Array;
}

const textEncoder = new TextEncoder();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function write16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function write32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function assertSafeName(name: string): void {
  if (!/^[a-z0-9][a-z0-9._/-]{0,199}$/u.test(name) || name.includes("..") || name.startsWith("/")) {
    throw new Error(`Unsafe ZIP entry name: ${name}`);
  }
}

/** Uncompressed ZIP with fixed DOS timestamp (1980-01-01) and lexical entry order. */
export function createDeterministicZip(entries: readonly DeterministicZipEntry[]): Uint8Array {
  const sorted = [...entries].sort((left, right) => left.name.localeCompare(right.name));
  if (new Set(sorted.map(({ name }) => name)).size !== sorted.length) {
    throw new Error("Duplicate ZIP entry name");
  }
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of sorted) {
    assertSafeName(entry.name);
    const name = textEncoder.encode(entry.name);
    const checksum = crc32(entry.body);
    const local = new Uint8Array(30 + name.byteLength);
    const localView = new DataView(local.buffer);
    write32(localView, 0, 0x04034b50);
    write16(localView, 4, 20);
    write16(localView, 6, 0x0800);
    write16(localView, 8, 0);
    write16(localView, 10, 0);
    write16(localView, 12, 0x0021);
    write32(localView, 14, checksum);
    write32(localView, 18, entry.body.byteLength);
    write32(localView, 22, entry.body.byteLength);
    write16(localView, 26, name.byteLength);
    local.set(name, 30);
    localChunks.push(local, entry.body);

    const central = new Uint8Array(46 + name.byteLength);
    const centralView = new DataView(central.buffer);
    write32(centralView, 0, 0x02014b50);
    write16(centralView, 4, 20);
    write16(centralView, 6, 20);
    write16(centralView, 8, 0x0800);
    write16(centralView, 10, 0);
    write16(centralView, 12, 0);
    write16(centralView, 14, 0x0021);
    write32(centralView, 16, checksum);
    write32(centralView, 20, entry.body.byteLength);
    write32(centralView, 24, entry.body.byteLength);
    write16(centralView, 28, name.byteLength);
    write32(centralView, 42, offset);
    central.set(name, 46);
    centralChunks.push(central);
    offset += local.byteLength + entry.body.byteLength;
  }

  const central = concat(centralChunks);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50);
  write16(endView, 8, sorted.length);
  write16(endView, 10, sorted.length);
  write32(endView, 12, central.byteLength);
  write32(endView, 16, offset);
  return concat([...localChunks, central, end]);
}

export function sha256(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}
