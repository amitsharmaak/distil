import type { CaptureQueueMessage } from "@/lib/contracts/capture";
import type { CaptureWorker } from "@/lib/capture/worker";

export function createCaptureQueueConsumer(worker: CaptureWorker) {
  return async (message: CaptureQueueMessage): Promise<void> => {
    await worker.handle(message);
  };
}
