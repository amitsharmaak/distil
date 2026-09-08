jest.mock("@/lib/storage/local-object-store", () => ({
  LocalTenantObjectStore: jest.fn().mockImplementation((root, environment) => ({
    root,
    environment,
  })),
}));
jest.mock("@/lib/storage/vercel-blob-object-store", () => ({
  VercelBlobTenantObjectStore: jest.fn().mockImplementation((token, environment) => ({
    token,
    environment,
  })),
}));

import { LocalTenantObjectStore } from "@/lib/storage/local-object-store";
import { getLifecycleObjectStore } from "@/lib/lifecycle/object-store-runtime";
import { VercelBlobTenantObjectStore } from "@/lib/storage/vercel-blob-object-store";

describe("lifecycle object-store runtime", () => {
  const originalRoot = process.env.DISTIL_LOCAL_OBJECT_STORE_DIR;

  afterAll(() => {
    if (originalRoot === undefined) delete process.env.DISTIL_LOCAL_OBJECT_STORE_DIR;
    else process.env.DISTIL_LOCAL_OBJECT_STORE_DIR = originalRoot;
  });

  it("fails closed when the local/test adapter root is absent", () => {
    delete process.env.DISTIL_LOCAL_OBJECT_STORE_DIR;

    expect(() => getLifecycleObjectStore()).toThrow(
      expect.objectContaining({ code: "UNAVAILABLE", status: 503 })
    );
    expect(LocalTenantObjectStore).not.toHaveBeenCalled();
  });

  it("constructs the test adapter once and reuses it", () => {
    process.env.DISTIL_LOCAL_OBJECT_STORE_DIR = "/private/tmp/distil-lifecycle-objects";

    const first = getLifecycleObjectStore();
    const second = getLifecycleObjectStore();

    expect(first).toBe(second);
    expect(LocalTenantObjectStore).toHaveBeenCalledTimes(1);
    expect(LocalTenantObjectStore).toHaveBeenCalledWith(
      "/private/tmp/distil-lifecycle-objects",
      "test"
    );
  });

  it("requires an explicit complete hosted provider configuration", () => {
    expect(() =>
      getLifecycleObjectStore({
        DISTIL_OBJECT_STORE_PROVIDER: "vercel-blob",
        DISTIL_OBJECT_STORE_ENVIRONMENT: "preview",
      })
    ).toThrow("misconfigured");
    expect(VercelBlobTenantObjectStore).not.toHaveBeenCalled();

    const environment = {
      DISTIL_OBJECT_STORE_PROVIDER: "vercel-blob",
      DISTIL_OBJECT_STORE_ENVIRONMENT: "preview",
      BLOB_READ_WRITE_TOKEN: "token",
      NODE_ENV: "production",
    };
    const first = getLifecycleObjectStore(environment);
    const second = getLifecycleObjectStore(environment);
    expect(first).toBe(second);
    expect(VercelBlobTenantObjectStore).toHaveBeenCalledWith("token", "preview");
  });

  it("never falls back to local storage in a hosted environment", () => {
    expect(() =>
      getLifecycleObjectStore({
        DISTIL_LOCAL_OBJECT_STORE_DIR: "/private/tmp/distil-lifecycle-objects",
        VERCEL: "1",
      })
    ).toThrow("Hosted account export storage is required");
  });
});
