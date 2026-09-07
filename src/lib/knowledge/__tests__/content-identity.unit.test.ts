import { createContentVersionIdentity, sha256 } from "../content-identity";

describe("content identities", () => {
  it("uses canonical SHA-256 labels", () => {
    expect(sha256("distil")).toBe(
      "sha256:ca0aab1c017d7f364223801b27be12be09f3b2d9eb250b1b7d4d3e77c97e93c6"
    );
  });

  it("is stable for idempotent retries and scoped to item and extractor", () => {
    const input = { itemId: "item-1", content: "source text", extractorVersion: "readability-v1" };
    const first = createContentVersionIdentity(input);

    expect(createContentVersionIdentity(input)).toEqual(first);
    expect(createContentVersionIdentity({ ...input, itemId: "item-2" }).id).not.toBe(first.id);
    expect(
      createContentVersionIdentity({ ...input, extractorVersion: "readability-v2" }).id
    ).not.toBe(first.id);
    expect(createContentVersionIdentity({ ...input, itemId: "item-2" }).contentHash).toBe(
      first.contentHash
    );
  });
});
