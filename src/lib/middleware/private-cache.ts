const PRIVATE_API_PREFIXES = ["/api/v1/", "/api/auth/"] as const;

/** Prevent tenant- and identity-scoped API responses from entering browser or shared caches. */
export function applyPrivateApiCacheControl<T extends Response>(pathname: string, response: T): T {
  if (
    pathname === "/api/v1" ||
    pathname === "/api/auth" ||
    PRIVATE_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    response.headers.set("cache-control", "private, no-store");
  }
  return response;
}
