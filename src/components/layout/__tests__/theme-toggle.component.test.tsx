/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle as Bare } from "../theme-toggle";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-provider";

jest.mock("next/navigation", () => ({ usePathname: () => "/feed" }));

function ThemeToggle(props: React.ComponentProps<typeof Bare>) {
  return (
    <ShortcutsProvider>
      <Bare {...props} />
    </ShortcutsProvider>
  );
}

const mockToggle = jest.fn();
const mockUseTheme = jest.fn();

jest.mock("../theme-provider", () => ({
  useTheme: () => mockUseTheme(),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    mockUseTheme.mockReturnValue({ theme: "light", toggle: mockToggle });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("uses the pre-paint theme class to select icons and labels without changing markup", () => {
    const { container, rerender } = render(<ThemeToggle />);
    const serverShape = container.innerHTML;

    expect(screen.getByText("Light mode")).toHaveClass("distil-theme-light");
    expect(screen.getByText("Dark mode")).toHaveClass("distil-theme-dark");
    expect(container.querySelector(".lucide-sun")).toHaveClass("distil-theme-light");
    expect(container.querySelector(".lucide-moon")).toHaveClass("distil-theme-dark");

    mockUseTheme.mockReturnValue({ theme: "dark", toggle: mockToggle });
    rerender(<ThemeToggle />);

    expect(container.innerHTML).toBe(serverShape);
  });

  it("keeps an accessible name when collapsed and invokes the provider toggle", () => {
    render(<ThemeToggle collapsed />);

    const button = screen.getByRole("button", { name: "Toggle theme" });
    expect(button).not.toHaveTextContent("Dark mode");

    fireEvent.click(button);

    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it("toggles on Shift+T and advertises the shortcut", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Toggle theme" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Shift+T"
    );
    fireEvent.keyDown(window, { key: "T", shiftKey: true });
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });
});
