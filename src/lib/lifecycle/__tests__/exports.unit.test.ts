import type { AccountExportRecord } from "../ports";
import { buildAccountExportArchive, stableJson } from "../exports";
import { accountExportDatasetNames } from "@/lib/postgres/lifecycle-repositories";

const record: AccountExportRecord = {
  id: "33333333-3333-4333-8333-333333333333",
  userId: "11111111-1111-4111-8111-111111111111" as AccountExportRecord["userId"],
  status: "running",
  idempotencyKey: "export-key-1",
  manifestVersion: 1,
  requestedAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
  downloadExpiresAt: "2026-09-09T00:00:00.000Z",
  purgeAfter: "2026-09-15T00:00:00.000Z",
};

describe("deterministic account exports", () => {
  it("canonicalizes object keys recursively", () => {
    expect(new TextDecoder().decode(stableJson({ z: 1, a: { d: 2, b: 1 } }))).toBe(
      '{"a":{"b":1,"d":2},"z":1}\n'
    );
  });

  it("produces byte-identical versioned ZIPs and manifest hashes", () => {
    const datasets = [
      { name: "items", rows: [{ title: "Alpha", id: "item-1" }] },
      { name: "profile", rows: [{ displayName: "Amit", id: record.userId }] },
    ];
    const first = buildAccountExportArchive(record, datasets);
    const second = buildAccountExportArchive(record, [...datasets].reverse());
    expect(Buffer.from(first.body)).toEqual(Buffer.from(second.body));
    expect(first.manifest).toMatchObject({
      format: "distil.account-export.v1",
      manifestVersion: 1,
      generatedAt: record.requestedAt,
    });
    const uncompressed = Buffer.from(first.body).toString("utf8");
    expect(uncompressed).toContain("manifest.json");
    expect(uncompressed).toContain("data/v1/items.json");
  });

  it("uses an explicit export allowlist that excludes secrets and operational internals", () => {
    expect(accountExportDatasetNames).toEqual(
      expect.arrayContaining(["items", "raw-content", "usage"])
    );
    expect(accountExportDatasetNames).not.toEqual(
      expect.arrayContaining([
        "capture-tokens",
        "oauth-tokens",
        "sessions",
        "job-queue",
        "embeddings",
      ])
    );
  });
});
