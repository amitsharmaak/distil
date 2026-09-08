import { createAuthContext } from "@/lib/contracts";

import { VercelBlobTenantObjectStore, type VercelBlobClient } from "../vercel-blob-object-store";

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

function memoryClient() {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  const client: VercelBlobClient = {
    put: jest.fn(async (pathname, body, contentType) => {
      objects.set(pathname, {
        body: typeof body === "string" ? new TextEncoder().encode(body) : body,
        contentType,
      });
    }),
    get: jest.fn(async (pathname) => {
      const object = objects.get(pathname);
      if (!object) return null;
      return {
        statusCode: 200,
        stream: new Response(Buffer.from(object.body)).body!,
        headers: new Headers() as never,
        blob: {
          url: `https://store.private.blob.vercel-storage.com/${pathname}`,
          downloadUrl: `https://store.private.blob.vercel-storage.com/${pathname}?download=1`,
          pathname,
          contentDisposition: "attachment",
          cacheControl: "max-age=60",
          uploadedAt: new Date("2026-09-08T00:00:00.000Z"),
          etag: "etag",
          contentType: object.contentType,
          size: object.body.byteLength,
        },
      } as never;
    }),
    head: jest.fn(async (pathname) =>
      objects.has(pathname) ? ({ pathname } as never) : undefined
    ),
    delete: jest.fn(async (pathnames) => {
      for (const pathname of pathnames) objects.delete(pathname);
    }),
    list: jest.fn(async ({ prefix }) => ({
      blobs: [...objects.entries()]
        .filter(([pathname]) => pathname.startsWith(prefix))
        .map(([pathname, object]) => ({
          pathname,
          size: object.body.byteLength,
          uploadedAt: new Date("2026-09-08T00:00:00.000Z"),
          etag: "etag",
          url: `https://store.private.blob.vercel-storage.com/${pathname}`,
          downloadUrl: `https://store.private.blob.vercel-storage.com/${pathname}?download=1`,
        })),
      hasMore: false,
    })),
  };
  return { client, objects };
}

describe("private Vercel Blob tenant object store", () => {
  it("round-trips through tenant-derived private keys without exposing another tenant", async () => {
    const { client } = memoryClient();
    const store = new VercelBlobTenantObjectStore("secret-token", "preview", client);
    const body = new TextEncoder().encode("private export");

    const metadata = await store.put(alpha, ref, body, {
      contentType: "application/zip",
      createdAt: "2026-09-08T00:00:00.000Z",
    });

    await expect(store.read(alpha, ref)).resolves.toMatchObject(metadata);
    await expect(store.read(beta, ref)).resolves.toBeUndefined();
    await expect(store.list(alpha)).resolves.toEqual([metadata]);
    await expect(store.list(beta)).resolves.toEqual([]);
    expect(client.put).toHaveBeenCalledWith(
      `preview/users/${alpha.userId}/exports/${ref.objectId}/v1.bin`,
      body,
      "application/zip"
    );
  });

  it("integrity-checks downloads and makes deletion idempotent", async () => {
    const { client, objects } = memoryClient();
    const store = new VercelBlobTenantObjectStore("secret-token", "preview", client);
    await store.put(alpha, ref, new TextEncoder().encode("expected"), {
      contentType: "application/zip",
    });
    const bodyKey = `preview/users/${alpha.userId}/exports/${ref.objectId}/v1.bin`;
    objects.set(bodyKey, {
      body: new TextEncoder().encode("tampered"),
      contentType: "application/zip",
    });

    await expect(store.read(alpha, ref)).rejects.toThrow("integrity verification");
    await expect(store.delete(alpha, ref)).resolves.toBe(true);
    await expect(store.delete(alpha, ref)).resolves.toBe(false);
  });

  it("cleans up the body if the metadata write fails", async () => {
    const { client } = memoryClient();
    jest.mocked(client.put).mockRejectedValueOnce(new Error("metadata unavailable"));
    const store = new VercelBlobTenantObjectStore("secret-token", "preview", client);

    await expect(
      store.put(alpha, ref, new TextEncoder().encode("export"), {
        contentType: "application/zip",
      })
    ).rejects.toThrow("metadata unavailable");
    expect(client.delete).not.toHaveBeenCalled();

    jest
      .mocked(client.put)
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error("metadata unavailable"));
    await expect(
      store.put(alpha, ref, new TextEncoder().encode("export"), {
        contentType: "application/zip",
      })
    ).rejects.toThrow("metadata unavailable");
    expect(client.delete).toHaveBeenCalledWith([
      `preview/users/${alpha.userId}/exports/${ref.objectId}/v1.bin`,
      `preview/users/${alpha.userId}/exports/${ref.objectId}/v1.metadata.json`,
    ]);
  });
});
