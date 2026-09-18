/**
 * @jest-environment node
 */

const headers = jest.fn();
const resolveRequestAuthContext = jest.fn();
const withTenantRepositories = jest.fn();
const readPhase2FeatureFlags = jest.fn();
const error = jest.fn();

jest.mock("next/headers", () => ({ headers: () => headers() }));
jest.mock("@/lib/auth/account-service", () => ({
  resolveRequestAuthContext: (...args: unknown[]) => resolveRequestAuthContext(...args),
}));
jest.mock("@/lib/database", () => ({
  withTenantRepositories: (...args: unknown[]) => withTenantRepositories(...args),
}));
jest.mock("@/lib/phase2/feature-flags", () => ({
  readPhase2FeatureFlags: () => readPhase2FeatureFlags(),
}));
jest.mock("@/lib/logger", () => ({ apiLogger: { error: (...args: unknown[]) => error(...args) } }));

import { AccessDeniedError } from "@/lib/auth/account";
import { loadPageData } from "../page-data";

const context = { userId: "10000000-0000-4000-8000-000000000001" };

describe("loadPageData", () => {
  const databaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DATABASE_URL = "postgresql://runtime";
    readPhase2FeatureFlags.mockReturnValue({ serverRender: true });
    headers.mockResolvedValue(new Headers({ "x-distil-trace": "trace-1" }));
    resolveRequestAuthContext.mockResolvedValue(context);
    withTenantRepositories.mockImplementation(async (_context, operation) =>
      operation({ feed: "repositories" }, context)
    );
  });

  afterAll(() => {
    if (databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = databaseUrl;
  });

  it("resolves the user from the request headers and runs the operation in one tenant transaction", async () => {
    const operation = jest.fn().mockResolvedValue("page");
    await expect(loadPageData("/feed", operation)).resolves.toBe("page");
    const request = resolveRequestAuthContext.mock.calls[0][0] as Request;
    expect(request.url).toBe("http://distil.local/feed");
    expect(request.headers.get("x-distil-trace")).toBe("trace-1");
    expect(withTenantRepositories).toHaveBeenCalledWith(context, expect.any(Function));
    expect(operation).toHaveBeenCalledWith({ feed: "repositories" }, context);
  });

  it("returns null without touching auth when the flag is off or PostgreSQL is absent, but always reads the request", async () => {
    readPhase2FeatureFlags.mockReturnValue({ serverRender: false });
    await expect(loadPageData("/", jest.fn())).resolves.toBeNull();
    readPhase2FeatureFlags.mockReturnValue({ serverRender: true });
    delete process.env.DATABASE_URL;
    await expect(loadPageData("/", jest.fn())).resolves.toBeNull();
    expect(resolveRequestAuthContext).not.toHaveBeenCalled();
    // The request read is what keeps the page dynamic; a build without
    // DATABASE_URL must not be able to prerender the fallback.
    expect(headers).toHaveBeenCalledTimes(2);
  });

  it("returns null for a request without a resolvable user and rethrows other auth failures", async () => {
    resolveRequestAuthContext.mockRejectedValueOnce(new AccessDeniedError("unauthenticated"));
    await expect(loadPageData("/", jest.fn())).resolves.toBeNull();
    expect(withTenantRepositories).not.toHaveBeenCalled();
    resolveRequestAuthContext.mockRejectedValueOnce(new Error("provider down"));
    await expect(loadPageData("/", jest.fn())).rejects.toThrow("provider down");
  });

  it("degrades a data failure to null and logs it", async () => {
    withTenantRepositories.mockRejectedValueOnce(new Error("relation missing"));
    await expect(loadPageData("/feed", jest.fn())).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ route: "/feed" }),
      "server render data load failed"
    );
  });
});
