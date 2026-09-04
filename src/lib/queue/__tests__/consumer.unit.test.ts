import { createCaptureQueueConsumer } from "../consumer";

describe("capture queue consumer", () => {
  it("awaits the worker instead of starting fire-and-forget work", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handle = jest.fn().mockReturnValue(pending);
    let completed = false;
    const processing = createCaptureQueueConsumer({ handle } as never)({
      version: 1,
      captureId: "10000000-0000-4000-8000-000000000001",
    }).then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    release();
    await processing;
    expect(handle).toHaveBeenCalledTimes(1);
  });
});
