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

export class FakeTenantObjectStore implements TenantObjectStore {
  private readonly objects = new Map<string, ObjectRead>();
  private failNextOperation?: "put" | "read" | "delete" | "list";

  constructor(private readonly environment = "test") {}

  failNext(operation: "put" | "read" | "delete" | "list"): void {
    this.failNextOperation = operation;
  }

  private maybeFail(operation: "put" | "read" | "delete" | "list"): void {
    if (this.failNextOperation !== operation) return;
    this.failNextOperation = undefined;
    throw new Error(`Injected object-store ${operation} failure`);
  }

  async put(
    context: AuthContext,
    value: LogicalObjectRef,
    body: Uint8Array,
    options: { contentType: string; createdAt?: string }
  ): Promise<ObjectMetadata> {
    this.maybeFail("put");
    const ref = parseLogicalObjectRef(value);
    const key = deriveTenantObjectKey(this.environment, context, ref);
    const record: ObjectRead = {
      ref,
      body: Uint8Array.from(body),
      contentType: options.contentType,
      contentHash: objectContentHash(body),
      sizeBytes: body.byteLength,
      createdAt: options.createdAt ?? new Date().toISOString(),
    };
    this.objects.set(key, record);
    return this.metadata(record);
  }

  async head(context: AuthContext, ref: LogicalObjectRef): Promise<ObjectMetadata | undefined> {
    const record = this.objects.get(deriveTenantObjectKey(this.environment, context, ref));
    return record ? this.metadata(record) : undefined;
  }

  async read(context: AuthContext, ref: LogicalObjectRef): Promise<ObjectRead | undefined> {
    this.maybeFail("read");
    const record = this.objects.get(deriveTenantObjectKey(this.environment, context, ref));
    return record ? { ...record, body: Uint8Array.from(record.body) } : undefined;
  }

  async delete(context: AuthContext, ref: LogicalObjectRef): Promise<boolean> {
    this.maybeFail("delete");
    return this.objects.delete(deriveTenantObjectKey(this.environment, context, ref));
  }

  async list(
    context: AuthContext,
    input: { objectType?: LogicalObjectRef["objectType"]; limit?: number } = {}
  ): Promise<ObjectMetadata[]> {
    this.maybeFail("list");
    const limit = Math.max(1, Math.min(input.limit ?? 100, 1_000));
    return [...this.objects.entries()]
      .filter(([key, value]) => {
        const tenantPrefix = deriveTenantObjectKey(this.environment, context, value.ref).split(
          `/${value.ref.objectType}/`,
          1
        )[0];
        return (
          key.startsWith(`${tenantPrefix}/`) &&
          (!input.objectType || value.ref.objectType === input.objectType)
        );
      })
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, limit)
      .map(([, value]) => this.metadata(value));
  }

  private metadata(record: ObjectRead): ObjectMetadata {
    return {
      ref: record.ref,
      contentType: record.contentType,
      contentHash: record.contentHash,
      sizeBytes: record.sizeBytes,
      createdAt: record.createdAt,
    };
  }
}
