/** @jest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CaptureReceiptCard } from "@/components/capture/capture-receipt";
import type { CaptureReceipt } from "@/lib/contracts/capture";

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
    jest.spyOn(document, "hasFocus").mockReturnValue(true);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
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
