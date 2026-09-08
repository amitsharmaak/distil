import type { CaptureQueueMessageV2 } from "@/lib/contracts/tenant-jobs";
import type { CaptureWorker } from "@/lib/capture/worker";

export function createCaptureQueueConsumer(worker: CaptureWorker) {
  return async (message: CaptureQueueMessageV2): Promise<void> => {
    await worker.handle(message);
  };
}
