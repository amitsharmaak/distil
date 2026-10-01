/**
 * @jest-environment jsdom
 */

import { act, render } from "@testing-library/react";
import {
  PROCESSING_POLL_INTERVAL_MS,
  type ProcessingItemStatus,
  useProcessingStatusPoll,
} from "../processing-status-poll";
import { CONTENT_AUTH_EVENT } from "../auth-events";

function Harness({
  ids = ["item-1"],
  onStatuses = jest.fn(),
  onTerminal = jest.fn(),
}: {
  ids?: string[];
  onStatuses?: (statuses: ProcessingItemStatus[]) => void;
  onTerminal?: () => void;
}) {
  useProcessingStatusPoll(ids, onStatuses, onTerminal);
  return null;
}

function statusResponse(processingStatus: ProcessingItemStatus["processingStatus"]): Response {
  return {
    ok: true,
    json: async () => ({ items: [{ id: "item-1", processingStatus }] }),
  } as Response;
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useProcessingStatusPoll", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(global.fetch).mockReset();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("waits while hidden or offline and resumes immediately when both allow polling", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    jest.mocked(global.fetch).mockResolvedValue(statusResponse("processing"));
    render(<Harness />);

    expect(jest.getTimerCount()).toBe(0);
    await advance(PROCESSING_POLL_INTERVAL_MS * 2);
    expect(global.fetch).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await advance(PROCESSING_POLL_INTERVAL_MS);
    expect(global.fetch).not.toHaveBeenCalled();

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    window.dispatchEvent(new Event("online"));
    await advance(0);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("aborts a deferred hidden request and resumes without overlapping it", async () => {
    let resolveFirst!: (response: Response) => void;
    let firstSignal: AbortSignal | undefined;
    const deferred = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    jest
      .mocked(global.fetch)
      .mockImplementationOnce((_input, init) => {
        firstSignal = init?.signal ?? undefined;
        return deferred;
      })
      .mockResolvedValue(statusResponse("processing"));
    render(<Harness />);

    await advance(PROCESSING_POLL_INTERVAL_MS);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(firstSignal?.aborted).toBe(true);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await advance(30_000);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst(statusResponse("processing"));
      await Promise.resolve();
      await Promise.resolve();
    });
    await advance(0);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not overlap requests and backs failures off before trying again", async () => {
    let rejectFirst!: (reason: Error) => void;
    const pending = new Promise<Response>((_resolve, reject) => {
      rejectFirst = reject;
    });
    jest
      .mocked(global.fetch)
      .mockReturnValueOnce(pending)
      .mockResolvedValue(statusResponse("processing"));
    render(<Harness />);

    await advance(PROCESSING_POLL_INTERVAL_MS);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await advance(30_000);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectFirst(new Error("offline"));
      await Promise.resolve();
      await Promise.resolve();
    });
    await advance(PROCESSING_POLL_INTERVAL_MS * 2 - 1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("stops on a terminal result and aborts an in-flight request on unmount", async () => {
    const onStatuses = jest.fn();
    const onTerminal = jest.fn();
    jest.mocked(global.fetch).mockResolvedValue(statusResponse("ready"));
    const terminal = render(<Harness onStatuses={onStatuses} onTerminal={onTerminal} />);

    await advance(PROCESSING_POLL_INTERVAL_MS);
    expect(onStatuses).toHaveBeenCalledWith([{ id: "item-1", processingStatus: "ready" }]);
    expect(onTerminal).toHaveBeenCalledTimes(1);
    await advance(30_000);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    terminal.unmount();

    let capturedSignal: AbortSignal | undefined;
    jest.mocked(global.fetch).mockImplementation((_input, init) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });
    const active = render(<Harness ids={["item-2"]} />);
    await advance(PROCESSING_POLL_INTERVAL_MS);
    expect(capturedSignal?.aborted).toBe(false);
    active.unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("announces an account change when status polling is unauthorized", async () => {
    const onAccountChange = jest.fn();
    window.addEventListener(CONTENT_AUTH_EVENT, onAccountChange);
    jest.mocked(global.fetch).mockResolvedValue({ ok: false, status: 401 } as Response);
    const onStatuses = jest.fn();
    render(<Harness onStatuses={onStatuses} />);

    await advance(PROCESSING_POLL_INTERVAL_MS);

    expect(onAccountChange).toHaveBeenCalledTimes(1);
    expect(onStatuses).not.toHaveBeenCalled();
    window.removeEventListener(CONTENT_AUTH_EVENT, onAccountChange);
  });
});
