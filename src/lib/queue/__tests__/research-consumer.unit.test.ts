jest.mock("@/lib/database", () => ({ getTenantRepositories: jest.fn() }));
jest.mock("@/lib/ai/research", () => ({
  runResearchStage: jest.fn(),
  dispatchResearchStage: jest.fn(),
}));
jest.mock("@/lib/queue/research-dispatch", () => ({ resolveResearchDispatcher: jest.fn() }));

import { dispatchResearchStage, runResearchStage } from "@/lib/ai/research";
import { getTenantRepositories } from "@/lib/database";
import { createResearchRunMessageV1 } from "@/lib/contracts/tenant-jobs";
import { FakeResearchDispatcher } from "../dispatchers";
import { consumeResearchRunMessage, RESEARCH_QUEUE_ACTOR_ID } from "../research-consumer";

const message = createResearchRunMessageV1({
  userId: "10000000-0000-4000-8000-000000000001",
  reportId: "20000000-0000-4000-8000-000000000001",
  traceId: "30000000-0000-4000-8000-000000000001",
  step: "search",
  index: 1,
});
const repositories = { research: {} } as never;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getTenantRepositories).mockResolvedValue(repositories);
});

it("runs the stage under a system actor bound to the envelope tenant and publishes the next one", async () => {
  jest.mocked(runResearchStage).mockResolvedValue({
    outcome: "ran",
    stage: { kind: "search", index: 1 },
    next: { kind: "gaps" },
  });
  const dispatcher = new FakeResearchDispatcher();
  await consumeResearchRunMessage(message, dispatcher);

  expect(getTenantRepositories).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: message.userId,
      actorKind: "system",
      actorId: RESEARCH_QUEUE_ACTOR_ID,
      requestId: message.traceId,
    })
  );
  expect(runResearchStage).toHaveBeenCalledWith({
    context: expect.objectContaining({ userId: message.userId }),
    repositories,
    reportId: message.reportId,
  });
  expect(dispatchResearchStage).toHaveBeenCalledWith(
    dispatcher,
    expect.objectContaining({ userId: message.userId }),
    message.reportId,
    { kind: "gaps" }
  );
});

it("publishes nothing after the final stage or a skipped report", async () => {
  const dispatcher = new FakeResearchDispatcher();
  jest.mocked(runResearchStage).mockResolvedValue({
    outcome: "ran",
    stage: { kind: "synthesize" },
    next: null,
  });
  await consumeResearchRunMessage(message, dispatcher);
  jest.mocked(runResearchStage).mockResolvedValue({ outcome: "skipped", reason: "missing" });
  await consumeResearchRunMessage(message, dispatcher);
  expect(dispatchResearchStage).not.toHaveBeenCalled();
});

it("propagates a stage failure so the queue redelivers the message", async () => {
  jest.mocked(runResearchStage).mockRejectedValue(new Error("stage failed"));
  await expect(consumeResearchRunMessage(message, new FakeResearchDispatcher())).rejects.toThrow(
    "stage failed"
  );
  expect(dispatchResearchStage).not.toHaveBeenCalled();
});
