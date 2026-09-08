import { LocalTenantObjectStore } from "@/lib/storage/local-object-store";
import type { TenantObjectStore } from "@/lib/storage/object-store";
import { LifecycleError } from "./errors";

let localStore: TenantObjectStore | undefined;

/** Local/test seam only. A hosted adapter is intentionally absent. */
export function getLifecycleObjectStore(): TenantObjectStore {
  const root = process.env.DISTIL_LOCAL_OBJECT_STORE_DIR;
  if (!root) {
    throw new LifecycleError("UNAVAILABLE", 503, "Account export storage has not been configured");
  }
  localStore ??= new LocalTenantObjectStore(
    root,
    process.env.NODE_ENV === "test" ? "test" : "local"
  );
  return localStore;
}
