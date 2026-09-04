import { lookup } from "node:dns/promises";

import { assertSafeUrl, resolveSafeUrl } from "../url-safety";

jest.mock("node:dns/promises", () => ({
  lookup: jest.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
}));

describe("default DNS resolver", () => {
  it("uses the injected-at-module-boundary Node resolver for both public helpers", async () => {
    await expect(assertSafeUrl("https://example.com/article")).resolves.toMatchObject({
      hostname: "example.com",
    });
    await expect(resolveSafeUrl("https://example.org/article")).resolves.toMatchObject({
      addresses: [{ address: "93.184.216.34", family: 4 }],
    });
    expect(lookup).toHaveBeenCalledWith("example.com", { all: true, verbatim: true });
    expect(lookup).toHaveBeenCalledWith("example.org", { all: true, verbatim: true });
  });
});
