import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import type { AuthContext } from "@/lib/contracts";

import {
  deriveTenantObjectKey,
  objectContentHash,
  parseLogicalObjectRef,
  type LogicalObjectRef,
  type ObjectMetadata,
  type ObjectRead,
  type TenantObjectStore,
} from "./object-store";

interface StoredMetadata extends Omit<ObjectMetadata, "ref"> {
  ref: LogicalObjectRef;
}

export class LocalTenantObjectStore implements TenantObjectStore {
  private rootPromise?: Promise<string>;

  constructor(
    private readonly configuredRoot: string,
    private readonly environment = "local"
  ) {
    if (!configuredRoot || !resolve(configuredRoot).startsWith(sep)) {
      throw new Error("Local object-store root must be an explicit absolute path");
    }
    if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") {
      throw new Error("Local object storage is unavailable in hosted/production environments");
    }
  }

  private async root(): Promise<string> {
    this.rootPromise ??= (async () => {
      const absolute = resolve(this.configuredRoot);
      await mkdir(absolute, { recursive: true, mode: 0o700 });
      await chmod(absolute, 0o700);
      return realpath(absolute);
    })();
    return this.rootPromise;
  }

  private async paths(context: AuthContext, ref: LogicalObjectRef) {
    const root = await this.root();
    const key = deriveTenantObjectKey(this.environment, context, ref);
    const file = resolve(root, `${key}.bin`);
    if (!file.startsWith(`${root}${sep}`)) throw new Error("Object path escaped configured root");
    return { file, metadata: `${file}.json` };
  }

  async put(
    context: AuthContext,
    value: LogicalObjectRef,
    body: Uint8Array,
    options: { contentType: string; createdAt?: string }
  ): Promise<ObjectMetadata> {
    const ref = parseLogicalObjectRef(value);
    const paths = await this.paths(context, ref);
    await mkdir(dirname(paths.file), { recursive: true, mode: 0o700 });
    const metadata: StoredMetadata = {
      ref,
      contentType: options.contentType,
      contentHash: objectContentHash(body),
      sizeBytes: body.byteLength,
      createdAt: options.createdAt ?? new Date().toISOString(),
    };
    const suffix = randomUUID();
    const tempBody = `${paths.file}.${suffix}.tmp`;
    const tempMetadata = `${paths.metadata}.${suffix}.tmp`;
    await writeFile(tempBody, body, { mode: 0o600, flag: "wx" });
    await writeFile(tempMetadata, `${JSON.stringify(metadata)}\n`, { mode: 0o600, flag: "wx" });
    await rename(tempBody, paths.file);
    await rename(tempMetadata, paths.metadata);
    return metadata;
  }

  async head(context: AuthContext, ref: LogicalObjectRef): Promise<ObjectMetadata | undefined> {
    const paths = await this.paths(context, ref);
    try {
      return JSON.parse(await readFile(paths.metadata, "utf8")) as StoredMetadata;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async read(context: AuthContext, ref: LogicalObjectRef): Promise<ObjectRead | undefined> {
    const metadata = await this.head(context, ref);
    if (!metadata) return undefined;
    const paths = await this.paths(context, ref);
    const body = await readFile(paths.file);
    if (
      body.byteLength !== metadata.sizeBytes ||
      objectContentHash(body) !== metadata.contentHash
    ) {
      throw new Error("Stored object failed integrity verification");
    }
    return { ...metadata, body };
  }

  async delete(context: AuthContext, ref: LogicalObjectRef): Promise<boolean> {
    const paths = await this.paths(context, ref);
    try {
      await stat(paths.file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
    await Promise.all([rm(paths.file, { force: true }), rm(paths.metadata, { force: true })]);
    return true;
  }

  async list(
    context: AuthContext,
    input: { objectType?: LogicalObjectRef["objectType"]; limit?: number } = {}
  ): Promise<ObjectMetadata[]> {
    const root = await this.root();
    const probe = deriveTenantObjectKey(this.environment, context, {
      objectType: "exports",
      objectId: "00000000-0000-4000-8000-000000000000",
      version: 1,
    });
    const tenantRelative = probe.split("/exports/", 1)[0];
    const tenantRoot = resolve(root, tenantRelative);
    if (!tenantRoot.startsWith(`${root}${sep}`)) throw new Error("Tenant path escaped root");
    const limit = Math.max(1, Math.min(input.limit ?? 100, 1_000));
    const metadataFiles: string[] = [];
    const walk = async (directory: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (metadataFiles.length >= limit) return;
        const path = resolve(directory, entry.name);
        if (!path.startsWith(`${tenantRoot}${sep}`))
          throw new Error("Object path escaped tenant root");
        const info = await lstat(path);
        if (info.isSymbolicLink())
          throw new Error("Symbolic links are forbidden in local object storage");
        if (info.isDirectory()) await walk(path);
        else if (entry.name.endsWith(".bin.json")) metadataFiles.push(path);
      }
    };
    await walk(input.objectType ? resolve(tenantRoot, input.objectType) : tenantRoot);
    const records: ObjectMetadata[] = [];
    for (const file of metadataFiles) {
      const parsed = JSON.parse(await readFile(file, "utf8")) as StoredMetadata;
      records.push(parsed);
    }
    return records;
  }
}
