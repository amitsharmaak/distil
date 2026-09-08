import { createHash } from "node:crypto";

import { z } from "zod";

import { parseAuthContext, type AuthContext } from "@/lib/contracts";

export const logicalObjectRefSchema = z
  .object({
    objectType: z.enum(["exports", "raw-content"]),
    objectId: z.string().uuid(),
    version: z.number().int().positive(),
  })
  .strict()
  .readonly();

export type LogicalObjectRef = z.infer<typeof logicalObjectRefSchema>;

export interface ObjectMetadata {
  ref: LogicalObjectRef;
  contentType: string;
  contentHash: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ObjectRead extends ObjectMetadata {
  body: Uint8Array;
}

export interface TenantObjectStore {
  put(
    context: AuthContext,
    ref: LogicalObjectRef,
    body: Uint8Array,
    options: { contentType: string; createdAt?: string }
  ): Promise<ObjectMetadata>;
  head(context: AuthContext, ref: LogicalObjectRef): Promise<ObjectMetadata | undefined>;
  read(context: AuthContext, ref: LogicalObjectRef): Promise<ObjectRead | undefined>;
  delete(context: AuthContext, ref: LogicalObjectRef): Promise<boolean>;
  list(
    context: AuthContext,
    input?: { objectType?: LogicalObjectRef["objectType"]; limit?: number }
  ): Promise<ObjectMetadata[]>;
}

export function parseLogicalObjectRef(value: unknown): LogicalObjectRef {
  return logicalObjectRefSchema.parse(value);
}

export function serializeLogicalObjectRef(ref: LogicalObjectRef): string {
  const parsed = parseLogicalObjectRef(ref);
  return `${parsed.objectType}:${parsed.objectId}:${parsed.version}`;
}

export function deserializeLogicalObjectRef(value: string): LogicalObjectRef {
  const [objectType, objectId, rawVersion, ...rest] = value.split(":");
  if (rest.length > 0) throw new Error("Invalid logical object reference");
  return parseLogicalObjectRef({ objectType, objectId, version: Number(rawVersion) });
}

export function objectContentHash(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

export function deriveTenantObjectKey(
  environment: string,
  context: AuthContext,
  ref: LogicalObjectRef
): string {
  const tenant = parseAuthContext(context);
  const logical = parseLogicalObjectRef(ref);
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/u.test(environment)) {
    throw new Error("Object-store environment must be a safe lowercase label");
  }
  return `${environment}/users/${tenant.userId}/${logical.objectType}/${logical.objectId}/v${logical.version}`;
}
