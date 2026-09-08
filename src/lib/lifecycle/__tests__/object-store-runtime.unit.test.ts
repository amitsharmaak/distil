jest.mock("@/lib/storage/local-object-store", () => ({
  LocalTenantObjectStore: jest.fn().mockImplementation((root, environment) => ({
    root,
    environment,
  })),
}));

import { LocalTenantObjectStore } from "@/lib/storage/local-object-store";
import { getLifecycleObjectStore } from "@/lib/lifecycle/object-store-runtime";

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
});
