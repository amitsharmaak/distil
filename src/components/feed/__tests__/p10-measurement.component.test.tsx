/**
 * @jest-environment jsdom
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  P10MeasurementHarness,
  p10MeasurementEnabled,
  p10MeasurementRecord,
} from "../p10-measurement";

function resourceEntry(
  name: string,
  overrides: Partial<PerformanceResourceTiming> = {}
): PerformanceResourceTiming {
  return {
    name,
    entryType: "resource",
    startTime: 10,
    duration: 123.456,
    serverTiming: [
      { name: "proxy-auth-db", duration: 12.34, description: "q=1" },
      { name: "future-sensitive-metric", duration: 1, description: "account=secret" },
      { name: "db", duration: 4.56, description: "unsafe description" },
    ],
    ...overrides,
  } as PerformanceResourceTiming;
}

describe("temporary P10 measurement harness", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("requires the exact measurement query value", () => {
    expect(p10MeasurementEnabled(new URLSearchParams("p10measure=1"))).toBe(true);
    expect(p10MeasurementEnabled(new URLSearchParams("p10measure=true"))).toBe(false);
    expect(p10MeasurementEnabled(new URLSearchParams("p10measure=1x"))).toBe(false);
    expect(p10MeasurementEnabled(new URLSearchParams(""))).toBe(false);
  });

  it("logs only an allow-listed path, rounded duration and safe aggregate timings", () => {
    const record = p10MeasurementRecord(
      resourceEntry("https://distil.example/api/v1/feed?q=private-search&collection=user-id"),
      "https://distil.example"
    );

    expect(record).toEqual({
      path: "/api/v1/feed",
      durationMs: 123.5,
      serverTiming: [
        { name: "proxy-auth-db", durationMs: 12.3, description: "q=1" },
        { name: "db", durationMs: 4.6 },
      ],
    });
    expect(JSON.stringify(record)).not.toContain("private-search");
    expect(JSON.stringify(record)).not.toContain("user-id");
    expect(JSON.stringify(record)).not.toContain("secret");
  });

  it("rejects cross-origin, unrelated and warm-up entries", () => {
    expect(
      p10MeasurementRecord(
        resourceEntry("https://other.example/api/v1/feed"),
        "https://distil.example"
      )
    ).toBeNull();
    expect(
      p10MeasurementRecord(
        resourceEntry("https://distil.example/api/v1/collections"),
        "https://distil.example"
      )
    ).toBeNull();
    expect(
      p10MeasurementRecord(resourceEntry("https://distil.example/feed"), "https://distil.example")
    ).toBeNull();
    expect(
      p10MeasurementRecord(
        resourceEntry("https://distil.example/api/v1/feed?p10warmup=1"),
        "https://distil.example"
      )
    ).toBeNull();
  });

  it("warms the API once, then issues exactly four measured requests", async () => {
    const fetchMock = jest.mocked(global.fetch);
    fetchMock.mockResolvedValue({
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
    } as unknown as Response);

    render(<P10MeasurementHarness apiPath="/api/v1/feed?archive=exclude&sort=for_you&limit=100" />);
    fireEvent.click(screen.getByRole("button", { name: "Warm + run 4 API samples" }));

    await screen.findByText("Four API samples complete");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/feed?archive=exclude&sort=for_you&limit=100&p10measure=1&p10warmup=1",
      { cache: "no-store" }
    );
    for (let call = 2; call <= 5; call += 1) {
      expect(fetchMock).toHaveBeenNthCalledWith(
        call,
        "/api/v1/feed?archive=exclude&sort=for_you&limit=100&p10measure=1",
        { cache: "no-store" }
      );
    }
  });

  it("observes and logs target resource entries without buffering earlier requests", () => {
    let callback: PerformanceObserverCallback | undefined;
    const observe = jest.fn();
    const disconnect = jest.fn();
    class FakePerformanceObserver {
      constructor(next: PerformanceObserverCallback) {
        callback = next;
      }
      observe = observe;
      disconnect = disconnect;
    }
    Object.defineProperty(globalThis, "PerformanceObserver", {
      configurable: true,
      value: FakePerformanceObserver,
    });
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    const { unmount } = render(
      <P10MeasurementHarness apiPath="/api/v1/feed?archive=exclude&sort=for_you&limit=100" />
    );

    expect(observe).toHaveBeenCalledWith({ type: "resource" });
    act(() => {
      callback?.(
        {
          getEntries: () => [resourceEntry("http://localhost/feed?_rsc=opaque")],
        } as unknown as PerformanceObserverEntryList,
        {} as PerformanceObserver
      );
    });

    expect(info).toHaveBeenCalledWith(
      '[P10 measurement] {"path":"/feed","durationMs":123.5,"serverTiming":[{"name":"proxy-auth-db","durationMs":12.3,"description":"q=1"},{"name":"db","durationMs":4.6}]}'
    );
    expect(screen.getByText(/Captured: API 0 · Feed RSC 1/)).toBeInTheDocument();
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
