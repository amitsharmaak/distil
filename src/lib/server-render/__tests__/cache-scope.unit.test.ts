import { AccessDeniedError } from "@/lib/auth/account";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { headers } from "next/headers";
import { loadClientCacheScope } from "../cache-scope";
import { readNeonAuthFoundation } from "@/lib/auth/neon-auth-foundation";

jest.mock("react", () => ({ cache: (fn: unknown) => fn }));
jest.mock("next/headers", () => ({ headers: jest.fn() }));
jest.mock("@/lib/auth/account-service", () => ({ resolveRequestAuthContext: jest.fn() }));
jest.mock("@/lib/auth/neon-auth-foundation", () => ({ readNeonAuthFoundation: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(readNeonAuthFoundation)
    .mockReturnValue({ enabled: true, status: "ready", missing: [] });
});

it("does not call the hosted provider on a public page without a proxy handoff", async () => {
  jest.mocked(headers).mockResolvedValue(new Headers() as Awaited<ReturnType<typeof headers>>);
  expect(await loadClientCacheScope()).toBeNull();
  expect(resolveRequestAuthContext).not.toHaveBeenCalled();
});

it("uses only the identity verified by the shared auth resolver", async () => {
  jest
    .mocked(headers)
    .mockResolvedValue(
      new Headers({ "x-distil-identity": "untrusted-input" }) as Awaited<ReturnType<typeof headers>>
    );
  jest
    .mocked(resolveRequestAuthContext)
    .mockResolvedValue({ userId: "verified-account" } as Awaited<
      ReturnType<typeof resolveRequestAuthContext>
    >);
  expect(await loadClientCacheScope()).toBe("verified-account");
  expect(resolveRequestAuthContext).toHaveBeenCalledTimes(1);
});

it("does not expose a scope when the resolver denies the account", async () => {
  jest
    .mocked(headers)
    .mockResolvedValue(
      new Headers({ "x-distil-identity": "rejected" }) as Awaited<ReturnType<typeof headers>>
    );
  jest.mocked(resolveRequestAuthContext).mockRejectedValue(new AccessDeniedError("disabled"));
  expect(await loadClientCacheScope()).toBeNull();
});
