/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";

import { UpdatedTime } from "../updated-time";
import {
  CLIENT_CLOCK,
  SERVER_CLOCK,
  serverRenderThenHydrate,
  type HydrationResult,
} from "../../../../tests/support/hydration";

const AT = Date.UTC(2026, 9, 2, 12, 45);

let result: HydrationResult | undefined;
afterEach(() => {
  result?.unmount();
  result = undefined;
  jest.restoreAllMocks();
});

describe("UpdatedTime", () => {
  it("sends no clock time from the server and hydrates without a mismatch", async () => {
    result = await serverRenderThenHydrate(<UpdatedTime at={AT} />);

    // The server cannot know the reader's timezone, so it formats nothing.
    expect(result.serverHtml).not.toContain(SERVER_CLOCK);
    expect(result.serverHtml).not.toContain(CLIENT_CLOCK);
    expect(result.serverHtml).toContain("Updated");
    // The first client render equals the server HTML: React recovered from nothing.
    expect(result.recoverableErrors).toEqual([]);
    // Then the reader's local time fills the reserved space.
    expect(result.container).toHaveTextContent(`Updated ${CLIENT_CLOCK}`);
    expect(result.container.querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-10-02T12:45:00.000Z"
    );
  });

  it("reserves the width of a time in the server HTML so the header does not shift", async () => {
    result = await serverRenderThenHydrate(<UpdatedTime at={AT} label="Last updated" />);

    const server = document.createElement("div");
    server.innerHTML = result.serverHtml;
    const placeholder = server.querySelector('[aria-hidden="true"]');
    expect(placeholder).toHaveClass("invisible");
    expect(placeholder?.textContent).toHaveLength(8);
    expect(server).toHaveTextContent("Last updated");
  });

  it("renders the local time at once on a client-side navigation", () => {
    jest.spyOn(Date.prototype, "toLocaleTimeString").mockReturnValue(CLIENT_CLOCK);
    render(<UpdatedTime at={AT} />);
    expect(screen.getByText(CLIENT_CLOCK)).toBeInTheDocument();
  });

  it("says so when nothing has been read yet, on the server and the client alike", async () => {
    result = await serverRenderThenHydrate(<UpdatedTime at={0} />);
    expect(result.serverHtml).toContain("Not updated yet");
    expect(result.recoverableErrors).toEqual([]);
    expect(result.container).toHaveTextContent("Not updated yet");
  });
});
