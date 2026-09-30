/** @jest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { KeyboardShortcutsCard } from "../keyboard-shortcuts-card";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-provider";
import { ShortcutsHelpDialog } from "@/components/shortcuts/shortcuts-help-dialog";
import {
  readSingleKeyShortcuts,
  setSingleKeyShortcuts,
} from "@/components/shortcuts/shortcuts-preference";

jest.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

afterEach(() => {
  cleanup();
  act(() => setSingleKeyShortcuts(true));
});

describe("KeyboardShortcutsCard", () => {
  it("toggles the single-key preference", () => {
    render(
      <ShortcutsProvider>
        <KeyboardShortcutsCard />
      </ShortcutsProvider>
    );
    const sw = screen.getByRole("switch", { name: "Single-key shortcuts" });
    expect(sw).toBeChecked();
    fireEvent.click(sw);
    expect(readSingleKeyShortcuts()).toBe(false);
    expect(sw).not.toBeChecked();
  });

  it("opens the help dialog", () => {
    render(
      <ShortcutsProvider>
        <KeyboardShortcutsCard />
        <ShortcutsHelpDialog />
      </ShortcutsProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: /View all shortcuts/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
