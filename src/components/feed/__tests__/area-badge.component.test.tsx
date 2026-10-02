/**
 * @jest-environment jsdom
 */

import { renderWithContentCache as render } from "../../../../tests/support/content-cache";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import { AreaBadge } from "../area-badge";

function okResponse(): Response {
  return { ok: true, json: jest.fn().mockResolvedValue({}) } as unknown as Response;
}

/** Opens the menu from the keyboard (jsdom has no PointerEvent for Radix's pointer path). */
function openMenu(trigger: HTMLElement) {
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
}

describe("AreaBadge", () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.mocked(global.fetch);
    fetchMock.mockResolvedValue(okResponse());
  });

  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  it("shows the area and saves a new one optimistically through the state API", async () => {
    const onChange = jest.fn();
    render(<AreaBadge itemId="item-1" area="updates" aiArea="updates" onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: "Area: Updates. Change area" });
    openMenu(trigger);
    expect(await screen.findByRole("menuitem", { name: /Updates/ })).toHaveTextContent("AI pick");

    fireEvent.click(screen.getByRole("menuitem", { name: /Personal/ }));
    expect(
      await screen.findByRole("button", { name: "Area: Personal. Change area" })
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/items/item-1/state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ area: "personal" }),
    });
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ area: "personal", manualArea: "personal" })
    );
  });

  it("reports no correction when the AI's own area is picked back", async () => {
    const onChange = jest.fn();
    render(<AreaBadge itemId="item-1" area="personal" aiArea="work" onChange={onChange} />);
    openMenu(screen.getByRole("button", { name: /Change area/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Work/ }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ area: "work", manualArea: undefined })
    );
  });

  it("rolls back and says so when saving fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: jest.fn() } as unknown as Response);
    render(<AreaBadge itemId="item-1" area="work" aiArea="work" />);
    openMenu(screen.getByRole("button", { name: /Change area/ }));
    await act(async () => {
      fireEvent.click(await screen.findByRole("menuitem", { name: /Learning/ }));
    });
    expect(
      await screen.findByRole("button", { name: "Area: Work. Change area" })
    ).toBeInTheDocument();
  });

  it("offers to set an area on an unclassified item", () => {
    render(<AreaBadge itemId="item-1" />);
    expect(screen.getByRole("button", { name: "Set area" })).toBeInTheDocument();
  });

  it("never lets a click reach an enclosing link", () => {
    // Stands in for the feed card's <Link>, whose click handler would navigate.
    const onLinkClick = jest.fn();
    render(
      <div onClick={onLinkClick}>
        <AreaBadge itemId="item-1" area="work" />
      </div>
    );
    fireEvent.click(screen.getByRole("button", { name: /Change area/ }));
    expect(onLinkClick).not.toHaveBeenCalled();
  });

  it("is controlled when open is provided and reports close", async () => {
    const onOpenChange = jest.fn();
    render(<AreaBadge itemId="item-1" area="work" open onOpenChange={onOpenChange} />);
    expect(await screen.findByRole("menuitem", { name: /Personal/ })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("stays closed while controlled open is false", () => {
    render(<AreaBadge itemId="item-1" area="work" open={false} />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
