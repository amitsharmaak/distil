/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { MarkReadButton } from "../mark-read-button";

const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

describe("MarkReadButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("updates immediately and does not refresh after success", async () => {
    jest.mocked(global.fetch).mockResolvedValue({ ok: true } as Response);
    const onRead = jest.fn();
    render(<MarkReadButton itemId="item-1" isRead={false} onRead={onRead} showLabel />);

    fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));

    expect(screen.getByRole("button", { name: "Read" })).toBeDisabled();
    expect(onRead).toHaveBeenCalledWith(true);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith("/api/items/item-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRead: true }),
    });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("rolls back and refreshes only when the update fails", async () => {
    jest.mocked(global.fetch).mockResolvedValue({ ok: false } as Response);
    const onRead = jest.fn();
    render(<MarkReadButton itemId="item-2" isRead={false} onRead={onRead} showLabel />);

    fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Mark as read" })).toBeEnabled());
    expect(onRead.mock.calls).toEqual([[true], [false]]);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
