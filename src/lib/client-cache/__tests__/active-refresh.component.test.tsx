/** @jest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { ContentCacheProvider } from "../content-cache";
import { useActiveContentRefresh } from "../active-refresh";

beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
afterEach(() => jest.useRealTimers());

it("updates only active visible online work, without overlap, and stops at completion", async () => {
  let finish!: (value: { error: unknown }) => void;
  const refresh = jest.fn(
    () =>
      new Promise<{ error: unknown }>((resolve) => {
        finish = resolve;
      })
  );
  const { rerender } = renderHook(
    ({ active }) => useActiveContentRefresh("research", "list", active, refresh),
    {
      initialProps: { active: true },
      wrapper: ({ children }) => (
        <ContentCacheProvider accountKey="one">{children}</ContentCacheProvider>
      ),
    }
  );
  await act(async () => jest.advanceTimersByTime(3000));
  act(() => {
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await act(async () => jest.advanceTimersByTime(30_000));
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish({ error: null });
  });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  act(() => window.dispatchEvent(new Event("offline")));
  await act(async () => jest.advanceTimersByTime(30_000));
  expect(refresh).toHaveBeenCalledTimes(1);
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  act(() => window.dispatchEvent(new Event("online")));
  await act(async () => jest.advanceTimersByTime(3000));
  expect(refresh).toHaveBeenCalledTimes(2);
  await act(async () => finish({ error: null }));
  rerender({ active: false });
  await act(async () => jest.advanceTimersByTime(60_000));
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("backs off failures and resumes after a hidden tab becomes visible", async () => {
  const refresh = jest.fn().mockResolvedValue({ error: new Error("offline") });
  renderHook(() => useActiveContentRefresh("research", "list", true, refresh), {
    wrapper: ({ children }) => (
      <ContentCacheProvider accountKey="one">{children}</ContentCacheProvider>
    ),
  });
  await act(async () => jest.advanceTimersByTime(3000));
  await act(async () => jest.advanceTimersByTime(5999));
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => jest.advanceTimersByTime(1));
  expect(refresh).toHaveBeenCalledTimes(2);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await act(async () => jest.advanceTimersByTime(60_000));
  expect(refresh).toHaveBeenCalledTimes(2);
});
