/** @jest-environment jsdom */

import { renderWithContentCache as render } from "../../../../tests/support/content-cache";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { CaptureReceiptCard } from "@/components/capture/capture-receipt";
import type { CaptureReceipt } from "@/lib/contracts/capture";

const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
const response = (body: unknown, status: number) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const base: CaptureReceipt = {
  id: "capture-1",
  normalizedUrl: "https://example.com/a",
  status: "queued",
  retryable: true,
  attempts: 0,
  createdAt: "2026-03-01T00:00:00Z",
  updatedAt: "2026-03-01T00:00:00Z",
};

describe("CaptureReceiptCard", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-01T00:00:00Z"));
    fetchMock.mockReset();
    mockRefresh.mockReset();
    jest.spyOn(document, "hasFocus").mockReturnValue(true);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("polls every two seconds while visible and stops after reaching ready", async () => {
    fetchMock.mockResolvedValueOnce(
      response({ receipt: { ...base, status: "ready", itemId: "item-1", attempts: 1 } }, 200)
    );
    render(<CaptureReceiptCard initialReceipt={base} />);
    await act(async () => {
      jest.advanceTimersByTime(2_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/captures/capture-1", expect.any(Object));
    expect(await screen.findByRole("link", { name: "Read article" })).toHaveAttribute(
      "href",
      "/feed/item-1"
    );
    await act(async () => {
      jest.advanceTimersByTime(4_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not poll while the document is hidden", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    render(<CaptureReceiptCard initialReceipt={base} />);
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops automatic polling after two minutes", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    render(<CaptureReceiptCard initialReceipt={base} />);
    await act(async () => {
      jest.advanceTimersByTime(122_000);
    });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      jest.advanceTimersByTime(4_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pauses offline and resumes online without overlapping a manual check", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    let finish!: (value: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    render(<CaptureReceiptCard initialReceipt={base} />);
    await act(async () => jest.advanceTimersByTime(10_000));
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      jest.advanceTimersByTime(2000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Check now" }));
    await act(async () => jest.advanceTimersByTime(6000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () =>
      finish(response({ receipt: { ...base, status: "ready", itemId: "item-1" } }, 200))
    );
    await act(async () => jest.advanceTimersByTime(6000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("backs off failed status requests and aborts a hidden tab's in-flight request", async () => {
    fetchMock
      .mockResolvedValueOnce(response({}, 503))
      .mockImplementation(() => new Promise(() => {}));
    render(<CaptureReceiptCard initialReceipt={base} />);
    await act(async () => jest.advanceTimersByTime(2000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTime(3999));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTime(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const signal = fetchMock.mock.calls[1][1]?.signal;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(signal?.aborted).toBe(true);
  });

  it("clears account-scoped content when a status refresh is unauthorized", async () => {
    fetchMock.mockResolvedValue(response({}, 401));
    render(<CaptureReceiptCard initialReceipt={base} />);

    fireEvent.click(screen.getByRole("button", { name: "Check now" }));

    expect(await screen.findByText("Your session changed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check now" })).not.toBeInTheDocument();
  });

  it("offers retry only for failed retryable receipts", async () => {
    render(
      <CaptureReceiptCard initialReceipt={{ ...base, status: "rejected", retryable: false }} />
    );
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    cleanup();
    render(<CaptureReceiptCard initialReceipt={{ ...base, status: "failed", retryable: true }} />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(response({ receipt: base }, 202));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/captures/capture-1/retry",
      expect.objectContaining({ method: "POST" })
    );
  });
});
