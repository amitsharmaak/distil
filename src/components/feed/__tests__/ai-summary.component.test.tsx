/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AISummary } from "../ai-summary";
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("remark-gfm", () => ({ __esModule: true, default: () => {} }));
jest.mock("@/lib/config", () => ({ config: { apiBaseUrl: "" } }));
beforeEach(() => jest.mocked(global.fetch).mockReset());
it("keeps the original readable after generation fails", async () => {
  jest
    .mocked(global.fetch)
    .mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Service unavailable" }),
    } as Response);
  render(<AISummary itemId="one" ogSummary="Original article remains readable" />);
  fireEvent.click(screen.getByText("Generate AI Summary"));
  await screen.findByText("Service unavailable");
  expect(screen.getByText("Original article remains readable")).toBeVisible();
});
it("retries the failed Detailed request and preserves the existing brief summary", async () => {
  jest
    .mocked(global.fetch)
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: "Temporary failure" } }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ summary: "Detailed result" }),
    } as Response);
  render(<AISummary itemId="one" ogSummary="original" initialBriefSummary="Existing brief" />);
  fireEvent.click(screen.getByText("Detailed"));
  await screen.findByText("Temporary failure");
  expect(screen.getByText("Existing brief")).toBeVisible();
  fireEvent.click(screen.getByText("Try Again"));
  await screen.findByText("Detailed result");
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(JSON.parse(jest.mocked(global.fetch).mock.calls[1][1]!.body as string)).toEqual({
    itemId: "one",
    length: "detailed",
    force: false,
  });
});
