/** @jest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-provider";
import { ReaderViewOverlay } from "../reader-view-overlay";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => "/feed/abc",
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

function setup(onClose = jest.fn()) {
  render(
    <ShortcutsProvider>
      <ReaderViewOverlay
        title="Title"
        createdAt="2026-01-01T00:00:00Z"
        sanitizedFullContent="<p>Body</p>"
        extractedLinks={[]}
        onClose={onClose}
      />
    </ShortcutsProvider>
  );
  return onClose;
}

describe("ReaderViewOverlay", () => {
  it("Escape closes the overlay without navigating away", () => {
    const onClose = setup();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("renders the title", () => {
    setup();
    expect(screen.getByText("Title")).toBeInTheDocument();
  });
});
