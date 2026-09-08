import { randomUUID } from "node:crypto";

import type { AuthContext } from "@/lib/contracts";
import { enqueueTenantJob } from "@/lib/jobs/tenant-runtime";
import type { AccountExportRecord, ExportDataset } from "@/lib/lifecycle/ports";
import type { RepositorySet } from "@/lib/repositories/ports";
import {
  deserializeLogicalObjectRef,
  serializeLogicalObjectRef,
  type ObjectRead,
  type TenantObjectStore,
} from "@/lib/storage/object-store";

import { createDeterministicZip, sha256 } from "./deterministic-zip";
import { LifecycleError } from "./errors";

export const ACCOUNT_EXPORT_FORMAT = "distil.account-export.v1";
export const ACCOUNT_EXPORT_JOB_TYPE = "account.export";
export const ACCOUNT_EXPORT_RETENTION_JOB_TYPE = "account.export-expire";
export const EXPORT_DOWNLOAD_TTL_MS = 24 * 60 * 60 * 1000;
export const EXPORT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)])
    );
  }
  return value;
}

export function stableJson(value: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(stable(value))}\n`);
}

export function buildAccountExportArchive(
  record: AccountExportRecord,
  datasets: readonly ExportDataset[]
): { body: Uint8Array; manifest: Record<string, unknown> } {
  const files = [...datasets]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((dataset) => {
      if (!/^[a-z][a-z0-9-]{0,63}$/u.test(dataset.name)) throw new Error("Invalid dataset name");
      const body = stableJson(dataset.rows);
      return {
        path: `data/v1/${dataset.name}.json`,
        body,
        mediaType: "application/json",
        schemaVersion: 1,
        rowCount: dataset.rows.length,
        sha256: sha256(body),
        sizeBytes: body.byteLength,
      };
    });
  const sourceContentHash = sha256(
    encoder.encode(files.map((file) => `${file.path}:${file.sha256}`).join("\n"))
  );
  const manifest = {
    format: ACCOUNT_EXPORT_FORMAT,
    manifestVersion: 1,
    exportId: record.id,
    requestedAt: record.requestedAt,
    generatedAt: record.requestedAt,
    sourceContentHash,
    files: files.map((file) => ({
      path: file.path,
      mediaType: file.mediaType,
      schemaVersion: file.schemaVersion,
      rowCount: file.rowCount,
      sha256: file.sha256,
      sizeBytes: file.sizeBytes,
    })),
    exclusions: [
      "authentication secrets and provider subjects",
      "capture token and session hashes",
      "OAuth credentials and one-time invitation state",
      "embeddings, rate-limit windows, queues, leases, and lifecycle internals",
      "agent tool inputs, outputs, and private operational logs",
      "physical object-store keys and signed URLs",
    ],
  };
  const body = createDeterministicZip([
    { name: "manifest.json", body: stableJson(manifest) },
    ...files.map((file) => ({ name: file.path, body: file.body })),
  ]);
  return { body, manifest };
}

export async function requestAccountExport(
  context: AuthContext,
  repositories: RepositorySet,
  input: { idempotencyKey: string; now?: Date }
): Promise<{ export: AccountExportRecord; jobId: string; created: boolean }> {
  const idempotencyKey = input.idempotencyKey.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(idempotencyKey)) {
    throw new LifecycleError("INVALID_REQUEST", 400, "A valid Idempotency-Key is required");
  }
  const now = input.now ?? new Date();
  const id = randomUUID();
  const result = await repositories.lifecycle.createExport({
    id,
    idempotencyKey,
    requestedAt: now.toISOString(),
    downloadExpiresAt: new Date(now.getTime() + EXPORT_DOWNLOAD_TTL_MS).toISOString(),
    purgeAfter: new Date(now.getTime() + EXPORT_RETENTION_MS).toISOString(),
  });
  const jobId = result.record.id;
  if (result.created) {
    const usage = await repositories.lifecycle.consumeUsage({
      date: now.toISOString().slice(0, 10),
      operation: "account.exports",
      requestCount: 1,
    });
    if (!usage.allowed) {
      await repositories.lifecycle.failExport(
        result.record.id,
        "QUOTA_EXCEEDED",
        now.toISOString()
      );
      throw new LifecycleError("QUOTA_EXCEEDED", 429, "Export quota exhausted");
    }
    await enqueueTenantJob(context, repositories, {
      jobId,
      jobType: ACCOUNT_EXPORT_JOB_TYPE,
      idempotencyKey: `account-export:${result.record.id}`,
      payload: { exportId: result.record.id, jobId },
      maxRetries: 5,
    });
    const retentionJobId = randomUUID();
    await enqueueTenantJob(context, repositories, {
      jobId: retentionJobId,
      jobType: ACCOUNT_EXPORT_RETENTION_JOB_TYPE,
      idempotencyKey: `account-export-expire:${result.record.id}`,
      payload: { exportId: result.record.id, jobId: retentionJobId },
      runAfter: result.record.purgeAfter,
      maxRetries: 20,
    });
  }
  return { export: result.record, jobId, created: result.created };
}

export async function purgeExpiredAccountExport(
  context: AuthContext,
  repositories: RepositorySet,
  objectStore: TenantObjectStore,
  exportId: string,
  now = new Date()
): Promise<AccountExportRecord> {
  const record = await repositories.lifecycle.findExport(exportId);
  if (!record) throw new LifecycleError("NOT_FOUND", 404, "Export not found");
  if (record.status === "expired") return record;
  if (new Date(record.purgeAfter).getTime() > now.getTime()) {
    throw new Error("Export retention period has not elapsed");
  }
  if (record.objectRef) {
    const ref = deserializeLogicalObjectRef(record.objectRef);
    await objectStore.delete(context, ref);
    if (await objectStore.head(context, ref)) {
      throw new Error("Export object remains after retention purge");
    }
  }
  const expired = await repositories.lifecycle.expireExport(record.id, now.toISOString());
  if (!expired) throw new Error("Export expiry transition failed");
  return expired;
}

export async function processAccountExport(
  context: AuthContext,
  repositories: RepositorySet,
  objectStore: TenantObjectStore,
  input: { exportId: string; jobId: string; now?: Date }
): Promise<AccountExportRecord> {
  const existing = await repositories.lifecycle.findExport(input.exportId);
  if (!existing) throw new LifecycleError("NOT_FOUND", 404, "Export not found");
  if (existing.status === "ready") return existing;
  if (await repositories.jobs.isCancellationRequested(input.jobId)) {
    throw new Error("Job cancellation requested");
  }
  const now = input.now ?? new Date();
  const record = await repositories.lifecycle.claimExport(input.exportId, now.toISOString());
  if (!record) throw new Error("Export is not claimable");
  try {
    const datasets = await repositories.lifecycle.readExportDatasets();
    if (await repositories.jobs.isCancellationRequested(input.jobId)) {
      throw new Error("Job cancellation requested");
    }
    const archive = buildAccountExportArchive(record, datasets);
    const ref = { objectType: "exports" as const, objectId: record.id, version: 1 };
    const metadata = await objectStore.put(context, ref, archive.body, {
      contentType: "application/zip",
      createdAt: now.toISOString(),
    });
    if (await repositories.jobs.isCancellationRequested(input.jobId)) {
      await objectStore.delete(context, ref);
      throw new Error("Job cancellation requested");
    }
    const completed = await repositories.lifecycle.completeExport({
      id: record.id,
      objectRef: serializeLogicalObjectRef(ref),
      contentHash: metadata.contentHash,
      sizeBytes: metadata.sizeBytes,
      completedAt: now.toISOString(),
    });
    if (!completed) throw new Error("Export completion transition failed");
    return completed;
  } catch (error) {
    await repositories.lifecycle.failExport(
      record.id,
      "EXPORT_GENERATION_FAILED",
      now.toISOString()
    );
    throw error;
  }
}

export async function readAccountExportDownload(
  context: AuthContext,
  repositories: RepositorySet,
  objectStore: TenantObjectStore,
  exportId: string,
  now = new Date()
): Promise<{ record: AccountExportRecord; object: ObjectRead }> {
  const record = await repositories.lifecycle.findExport(exportId);
  if (!record) throw new LifecycleError("NOT_FOUND", 404, "Export not found");
  if (
    record.status !== "ready" ||
    !record.objectRef ||
    !record.contentHash ||
    record.sizeBytes == null
  ) {
    throw new LifecycleError("NOT_READY", 409, "Export is not ready");
  }
  if (new Date(record.downloadExpiresAt).getTime() <= now.getTime()) {
    throw new LifecycleError("EXPIRED", 410, "Export download authorization expired");
  }
  const object = await objectStore.read(context, deserializeLogicalObjectRef(record.objectRef));
  if (!object) throw new LifecycleError("NOT_FOUND", 404, "Export not found");
  if (object.contentHash !== record.contentHash || object.sizeBytes !== record.sizeBytes) {
    throw new LifecycleError("UNAVAILABLE", 503, "Export integrity verification failed");
  }
  return { record, object };
}

export function publicExport(record: AccountExportRecord) {
  return {
    id: record.id,
    status: record.status,
    manifestVersion: record.manifestVersion,
    requestedAt: record.requestedAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
    downloadExpiresAt: record.downloadExpiresAt,
    purgeAfter: record.purgeAfter,
    sizeBytes: record.sizeBytes,
    failureCode: record.failureCode,
  };
}
