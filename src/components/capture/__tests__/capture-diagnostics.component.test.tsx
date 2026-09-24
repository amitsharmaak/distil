/** @jest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CaptureDiagnostics } from "@/components/capture/capture-diagnostics";
import type { CaptureReceipt } from "@/lib/contracts/capture";

const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
const response = (body: unknown, status: number) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const rejected: CaptureReceipt = {
  id: "capture-1",
  normalizedUrl: "https://notes.wisprflow.ai/shared/abc",
  status: "rejected",
  retryable: false,
  attempts: 1,
  error: {
    code: "CONTENT_REJECTED",
    message: "Distil could not identify enough readable article content on this page",
  },
  createdAt: "2026-03-01T00:00:00Z",
  updatedAt: "2026-03-01T00:00:00Z",
};

const failed: CaptureReceipt = {
  id: "capture-2",
  normalizedUrl: "https://example.com/article",
  status: "failed",
  retryable: true,
  attempts: 3,
  error: { code: "QUEUE_UNAVAILABLE", message: "The capture queue is temporarily unavailable" },
  createdAt: "2026-02-28T22:00:00Z",
  updatedAt: "2026-02-28T22:00:00Z",
};

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("CaptureDiagnostics", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-01T02:00:00Z"));
    fetchMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("lists only the captures that never produced an item, with the reason", async () => {
    fetchMock.mockResolvedValueOnce(response({ receipts: [rejected, failed] }, 200));
    render(<CaptureDiagnostics />);
    await settle();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/captures?status=rejected,failed&limit=25",
      expect.any(Object)
    );
    expect(screen.getByText("notes.wisprflow.ai/shared/abc")).toBeInTheDocument();
    expect(
      screen.getByText("Distil could not identify enough readable article content on this page")
    ).toBeInTheDocument();
    expect(screen.getByText("CONTENT_REJECTED")).toBeInTheDocument();
    expect(screen.getByText("Not ingested")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("3 attempts")).toBeInTheDocument();
    expect(screen.getByText("2h ago")).toBeInTheDocument();
  });

  it("reports an empty state when every capture produced an item", async () => {
    fetchMock.mockResolvedValueOnce(response({ receipts: [] }, 200));
    render(<CaptureDiagnostics />);
    await settle();

    expect(
      screen.getByText("Nothing to report — every capture has produced an item.")
    ).toBeInTheDocument();
  });

  it("retries a transient failure and saves a rejected link afresh", async () => {
    fetchMock.mockResolvedValueOnce(response({ receipts: [rejected, failed] }, 200));
    render(<CaptureDiagnostics />);
    await settle();

    // A rejected capture cannot be retried: it would reach the same verdict.
    fetchMock.mockResolvedValueOnce(response({ receipt: rejected }, 202));
    fetchMock.mockResolvedValueOnce(response({ receipts: [failed] }, 200));
    fireEvent.click(screen.getByRole("button", { name: "Save again" }));
    await settle();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/captures",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ url: rejected.normalizedUrl, source: "web" }),
      })
    );

    fetchMock.mockResolvedValueOnce(response({ receipt: failed }, 202));
    fetchMock.mockResolvedValueOnce(response({ receipts: [] }, 200));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await settle();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/captures/capture-2/retry",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("surfaces a load failure instead of an empty state", async () => {
    fetchMock.mockResolvedValueOnce(response({}, 500));
    render(<CaptureDiagnostics />);
    await settle();

    expect(screen.getByText("Could not load capture diagnostics.")).toBeInTheDocument();
    // Claiming nothing failed when the list could not be read would hide real failures.
    expect(
      screen.queryByText("Nothing to report — every capture has produced an item.")
    ).not.toBeInTheDocument();
  });
});
