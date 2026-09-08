import {
  BlobNotFoundError,
  del,
  get,
  head,
  list,
  put,
  type GetBlobResult,
  type HeadBlobResult,
  type ListBlobResult,
} from "@vercel/blob";
import { z } from "zod";

import { createAuthContext, type AuthContext } from "@/lib/contracts";

import {
  deriveTenantObjectKey,
  objectContentHash,
  parseLogicalObjectRef,
  type LogicalObjectRef,
  type ObjectMetadata,
  type ObjectRead,
  type TenantObjectStore,
} from "./object-store";

const storedMetadataSchema = z
  .object({
    ref: z.object({
      objectType: z.enum(["exports", "raw-content"]),
      objectId: z.string().uuid(),
      version: z.number().int().positive(),
    }),
    contentType: z.string().min(1),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    sizeBytes: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
  })
  .strict();

type BlobGetResult = GetBlobResult | null;

export interface VercelBlobClient {
  put(pathname: string, body: Uint8Array | string, contentType: string): Promise<void>;
  get(pathname: string): Promise<BlobGetResult>;
  head(pathname: string): Promise<HeadBlobResult | undefined>;
  delete(pathnames: string[]): Promise<void>;
  list(input: { prefix: string; limit: number; cursor?: string }): Promise<ListBlobResult>;
}

function sdkClient(token: string): VercelBlobClient {
  const command = { token };
  return {
    async put(pathname, body, contentType) {
      await put(pathname, typeof body === "string" ? body : Buffer.from(body), {
        ...command,
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        contentType,
      });
    },
    get: (pathname) => get(pathname, { ...command, access: "private", useCache: false }),
    async head(pathname) {
      try {
        return await head(pathname, command);
      } catch (error) {
        if (error instanceof BlobNotFoundError) return undefined;
        throw error;
      }
    },
    delete: (pathnames) => del(pathnames, command),
    list: (input) => list({ ...command, ...input }),
  };
}

async function bytes(result: Exclude<GetBlobResult, null>): Promise<Uint8Array> {
  if (result.statusCode !== 200) throw new Error("Unexpected conditional Blob response");
  return new Uint8Array(await new Response(result.stream).arrayBuffer());
}

/** Private, server-only Vercel Blob implementation of the tenant object-store port. */
export class VercelBlobTenantObjectStore implements TenantObjectStore {
  private readonly client: VercelBlobClient;

  constructor(
    token: string,
    private readonly environment: string,
    client?: VercelBlobClient
  ) {
    if (!token.trim()) throw new Error("Vercel Blob token is required");
    // Validate the environment label before any provider request is possible.
    deriveTenantObjectKey(
      environment,
      createAuthContext({
        userId: "00000000-0000-4000-8000-000000000000",
        actorId: "00000000-0000-4000-8000-000000000000",
        actorKind: "system",
        requestId: "00000000-0000-4000-8000-000000000000",
      }),
      { objectType: "exports", objectId: "00000000-0000-4000-8000-000000000000", version: 1 }
    );
    this.client = client ?? sdkClient(token);
  }

  private paths(context: AuthContext, value: LogicalObjectRef) {
    const ref = parseLogicalObjectRef(value);
    const key = deriveTenantObjectKey(this.environment, context, ref);
    return { ref, body: `${key}.bin`, metadata: `${key}.metadata.json` };
  }

  private async readMetadata(pathname: string): Promise<ObjectMetadata | undefined> {
    const result = await this.client.get(pathname);
    if (!result) return undefined;
    return storedMetadataSchema.parse(JSON.parse(new TextDecoder().decode(await bytes(result))));
  }

  async put(
    context: AuthContext,
    value: LogicalObjectRef,
    body: Uint8Array,
    options: { contentType: string; createdAt?: string }
  ): Promise<ObjectMetadata> {
    const paths = this.paths(context, value);
    const metadata: ObjectMetadata = {
      ref: paths.ref,
      contentType: options.contentType,
      contentHash: objectContentHash(body),
      sizeBytes: body.byteLength,
      createdAt: options.createdAt ?? new Date().toISOString(),
    };
    await this.client.put(paths.body, body, options.contentType);
    try {
      await this.client.put(paths.metadata, JSON.stringify(metadata), "application/json");
    } catch (error) {
      await this.client.delete([paths.body, paths.metadata]);
      throw error;
    }
    return metadata;
  }

  async head(context: AuthContext, value: LogicalObjectRef): Promise<ObjectMetadata | undefined> {
    const paths = this.paths(context, value);
    const metadata = await this.readMetadata(paths.metadata);
    if (!metadata) return undefined;
    if (JSON.stringify(metadata.ref) !== JSON.stringify(paths.ref)) {
      throw new Error("Stored object metadata does not match its tenant-derived key");
    }
    return metadata;
  }

  async read(context: AuthContext, value: LogicalObjectRef): Promise<ObjectRead | undefined> {
    const paths = this.paths(context, value);
    const metadata = await this.head(context, paths.ref);
    if (!metadata) return undefined;
    const result = await this.client.get(paths.body);
    if (!result) throw new Error("Stored object body is missing");
    const body = await bytes(result);
    if (
      body.byteLength !== metadata.sizeBytes ||
      objectContentHash(body) !== metadata.contentHash
    ) {
      throw new Error("Stored object failed integrity verification");
    }
    return { ...metadata, body };
  }

  async delete(context: AuthContext, value: LogicalObjectRef): Promise<boolean> {
    const paths = this.paths(context, value);
    const existed = Boolean(
      (await this.client.head(paths.body)) ?? (await this.client.head(paths.metadata))
    );
    await this.client.delete([paths.body, paths.metadata]);
    return existed;
  }

  async list(
    context: AuthContext,
    input: { objectType?: LogicalObjectRef["objectType"]; limit?: number } = {}
  ): Promise<ObjectMetadata[]> {
    const limit = Math.max(1, Math.min(input.limit ?? 100, 1_000));
    const probe = deriveTenantObjectKey(this.environment, context, {
      objectType: input.objectType ?? "exports",
      objectId: "00000000-0000-4000-8000-000000000000",
      version: 1,
    });
    const objectTypeMarker = `/${input.objectType ?? "exports"}/`;
    const tenantPrefix = probe.slice(0, probe.indexOf(objectTypeMarker) + 1);
    const prefix = input.objectType ? `${tenantPrefix}${input.objectType}/` : tenantPrefix;
    const records: ObjectMetadata[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.client.list({ prefix, limit: 1_000, cursor });
      for (const blob of page.blobs) {
        if (!blob.pathname.endsWith(".metadata.json")) continue;
        const metadata = await this.readMetadata(blob.pathname);
        if (metadata) records.push(metadata);
        if (records.length >= limit) return records;
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return records;
  }
}
