import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createAuthContext } from "@/lib/contracts";
import { FakeTenantObjectStore } from "../fake-object-store";
import { LocalTenantObjectStore } from "../local-object-store";
import { deriveTenantObjectKey } from "../object-store";

const alpha = createAuthContext({
  userId: "11111111-1111-4111-8111-111111111111",
  actorId: "11111111-1111-4111-8111-111111111111",
  actorKind: "user",
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
});
const beta = createAuthContext({
  userId: "22222222-2222-4222-8222-222222222222",
  actorId: "22222222-2222-4222-8222-222222222222",
  actorKind: "user",
  requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
});
const ref = {
  objectType: "exports" as const,
  objectId: "33333333-3333-4333-8333-333333333333",
  version: 1,
};

describe("tenant object-store contract", () => {
  it("derives an environment and tenant leading key and rejects unsafe labels", () => {
    expect(deriveTenantObjectKey("preview", alpha, ref)).toBe(
      `preview/users/${alpha.userId}/exports/${ref.objectId}/v1`
    );
    expect(() => deriveTenantObjectKey("../prod", alpha, ref)).toThrow("safe lowercase label");
  });

  it("conceals a same logical ref owned by another tenant", async () => {
    const store = new FakeTenantObjectStore();
    await store.put(alpha, ref, new TextEncoder().encode("alpha"), {
      contentType: "application/zip",
    });
    await expect(store.read(beta, ref)).resolves.toBeUndefined();
    await expect(store.list(beta)).resolves.toEqual([]);
    await expect(store.list(alpha)).resolves.toHaveLength(1);
  });

  it("round-trips and integrity-checks the guarded local adapter", async () => {
    const root = await mkdtemp(join(tmpdir(), "distil-objects-"));
    try {
      const store = new LocalTenantObjectStore(root, "test");
      const body = new TextEncoder().encode("local export");
      const metadata = await store.put(alpha, ref, body, { contentType: "application/zip" });
      await expect(store.read(alpha, ref)).resolves.toMatchObject({
        contentHash: metadata.contentHash,
        sizeBytes: body.byteLength,
      });
      await expect(store.read(beta, ref)).resolves.toBeUndefined();
      await expect(store.list(alpha)).resolves.toHaveLength(1);
      await expect(store.delete(alpha, ref)).resolves.toBe(true);
      await expect(store.list(alpha)).resolves.toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
