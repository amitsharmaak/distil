import { LocalTenantObjectStore } from "@/lib/storage/local-object-store";
import type { TenantObjectStore } from "@/lib/storage/object-store";
import { VercelBlobTenantObjectStore } from "@/lib/storage/vercel-blob-object-store";
import { LifecycleError } from "./errors";

let localStore: TenantObjectStore | undefined;
let hostedStore:
  | { token: string; environment: string; store: VercelBlobTenantObjectStore }
  | undefined;

/** Exact opt-in factory; production never falls back to local filesystem storage. */
export function getLifecycleObjectStore(
  environment: Readonly<Record<string, string | undefined>> = process.env
): TenantObjectStore {
  if (environment.DISTIL_OBJECT_STORE_PROVIDER === "vercel-blob") {
    const token = environment.BLOB_READ_WRITE_TOKEN;
    const namespace = environment.DISTIL_OBJECT_STORE_ENVIRONMENT;
    if (!token || !namespace) {
      throw new LifecycleError("UNAVAILABLE", 503, "Account export storage is misconfigured");
    }
    if (hostedStore?.token === token && hostedStore.environment === namespace) {
      return hostedStore.store;
    }
    const store = new VercelBlobTenantObjectStore(token, namespace);
    hostedStore = { token, environment: namespace, store };
    return store;
  }
  const root = environment.DISTIL_LOCAL_OBJECT_STORE_DIR;
  if (!root) {
    throw new LifecycleError("UNAVAILABLE", 503, "Account export storage has not been configured");
  }
  if (environment.VERCEL === "1" || environment.NODE_ENV === "production") {
    throw new LifecycleError("UNAVAILABLE", 503, "Hosted account export storage is required");
  }
  localStore ??= new LocalTenantObjectStore(
    root,
    environment.NODE_ENV === "test" ? "test" : "local"
  );
  return localStore;
}
