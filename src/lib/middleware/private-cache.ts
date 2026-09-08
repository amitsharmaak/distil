const PRIVATE_API_PREFIX = "/api/v1/";

/** Prevent tenant-scoped API responses from entering browser or shared caches. */
export function applyPrivateApiCacheControl<T extends Response>(pathname: string, response: T): T {
  if (pathname === "/api/v1" || pathname.startsWith(PRIVATE_API_PREFIX)) {
    response.headers.set("cache-control", "private, no-store");
  }
  return response;
}
