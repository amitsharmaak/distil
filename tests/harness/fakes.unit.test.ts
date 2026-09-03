import {
  createAIRateLimitError,
  createAITimeoutError,
  VALID_AI_SUMMARY,
} from "../fixtures/ai-responses";
import { FakeAIProvider } from "../support/fakes/ai-provider";
import { FakeCaptureDispatcher } from "../support/fakes/capture-dispatcher";
import { FakeClock } from "../support/fakes/clock";
import { FakeUuidGenerator } from "../support/fakes/uuid";

describe("deterministic failure fakes", () => {
  it("advances time without waiting and emits stable UUIDs", async () => {
    const clock = new FakeClock();
    const uuids = new FakeUuidGenerator();

    await clock.sleep(5_000);

    expect(clock.now().toISOString()).toBe("2026-01-15T10:00:05.000Z");
    expect(uuids.next()).toBe("00000000-0000-4000-8000-000000000001");
    expect(uuids.next()).toBe("00000000-0000-4000-8000-000000000002");
  });

  it("scripts valid, timeout, and rate-limit AI outcomes", async () => {
    const provider = new FakeAIProvider()
      .enqueueJSON(VALID_AI_SUMMARY)
      .enqueueText(createAITimeoutError(), createAIRateLimitError());

    await expect(provider.generateJSON("summarize", "fixture-model")).resolves.toEqual(
      VALID_AI_SUMMARY
    );
    await expect(provider.generateText("first", "fixture-model")).rejects.toMatchObject({
      code: "AI_TIMEOUT",
      retryable: true,
    });
    await expect(provider.generateText("second", "fixture-model")).rejects.toMatchObject({
      code: "AI_RATE_LIMITED",
      status: 429,
    });
    expect(provider.calls.map(({ operation }) => operation)).toEqual(["json", "text", "text"]);
  });

  it("records dispatch failures and deduplicates successful publications", async () => {
    const dispatcher = new FakeCaptureDispatcher().failNext(new Error("queue unavailable"));
    const message = {
      version: 1 as const,
      captureId: "00000000-0000-4000-8000-000000000001",
    };
    const options = { idempotencyKey: message.captureId };

    await expect(dispatcher.dispatch(message, options)).rejects.toThrow("queue unavailable");
    await dispatcher.dispatch(message, options);
    await dispatcher.dispatch(message, options);

    expect(dispatcher.attempts).toHaveLength(3);
    expect(dispatcher.deliveries).toHaveLength(1);
  });
});
