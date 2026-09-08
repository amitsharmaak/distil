import { createCaptureQueueConsumer } from "../consumer";
import { createCaptureQueueMessageV2 } from "@/lib/contracts/tenant-jobs";

describe("capture queue consumer", () => {
  it("awaits the worker instead of starting fire-and-forget work", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handle = jest.fn().mockReturnValue(pending);
    let completed = false;
    const message = createCaptureQueueMessageV2({
      userId: "10000000-0000-4000-8000-000000000010",
      captureId: "10000000-0000-4000-8000-000000000001",
      traceId: "10000000-0000-4000-8000-000000000011",
    });
    const processing = createCaptureQueueConsumer({ handle } as never)(message).then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    release();
    await processing;
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledWith(message);
  });
});
