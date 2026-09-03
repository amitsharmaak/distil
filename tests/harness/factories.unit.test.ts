import {
  captureQueueMessageFactory,
  captureReceiptFactory,
  contentItemFactory,
  defineFactory,
  resetFactories,
} from "../support/factories";

describe("typed test factories", () => {
  beforeEach(resetFactories);

  it("builds stable defaults and typed overrides", () => {
    const item = contentItemFactory.build({ priority: "high" });
    const receipt = captureReceiptFactory.build({
      status: "failed",
      retryable: true,
    });

    expect(item).toMatchObject({ id: "item-1", priority: "high" });
    expect(receipt).toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      status: "failed",
      retryable: true,
    });
  });

  it("resets sequences and rejects invalid list sizes", () => {
    expect(captureQueueMessageFactory.buildList(2)).toHaveLength(2);
    captureQueueMessageFactory.reset();
    expect(captureQueueMessageFactory.build().captureId.endsWith("000000000001")).toBe(true);

    const factory = defineFactory((sequence) => ({ sequence }));
    expect(() => factory.buildList(-1)).toThrow(RangeError);
  });
});
